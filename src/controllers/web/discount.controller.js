const {
  Product,
  ProductDiscount,
  ProductDiscountLog,
  ProductSubCategory,
  SubCategory,
  sequelize,
} = require("../../models");
const { Op } = require("sequelize");

/**
 * List product discounts with optional department/category/sub_category filter
 */
exports.list = async (req, res, next) => {
  try {
    const { department, category, sub_category, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const per_page = Math.max(1, parseInt(req.query.per_page) || 15);
    const limit = Math.min(per_page, 200);
    const offset = (page - 1) * limit;

    // Build Product where clause
    const productWhere = {};
    if (department && department !== "all")
      productWhere.department = department;
    if (category && category !== "all") productWhere.category = category;
    if (q) {
      productWhere[Op.or] = [
        { prod_code: { [Op.like]: `%${q}%` } },
        { prod_name: { [Op.like]: `%${q}%` } },
      ];
    }

    // Build Product include for joining
    const productInclude = [];
    if (sub_category && sub_category !== "all") {
      const subCategoryRow = await SubCategory.findOne({
        where: { scat_code: sub_category },
        attributes: ["id"],
        raw: true,
      });

      if (!subCategoryRow) {
        return res.json({
          success: true,
          data: [],
          pagination: { current_page: page, last_page: 0, total: 0, per_page },
        });
      }

      productInclude.push({
        model: ProductSubCategory,
        as: "productSubCategories",
        where: { sub_category_id: subCategoryRow.id },
        attributes: [],
        required: true,
      });
    }

    const { count, rows } = await ProductDiscount.findAndCountAll({
      include: [
        {
          model: Product,
          as: "product",
          where: productWhere,
          attributes: [
            "prod_code",
            "prod_name",
            "selling_price",
            "discount",
            "dis_per",
          ],
          required: true,
          include: productInclude,
        },
      ],
      order: [["id", "DESC"]],
      limit,
      offset,
      distinct: true,
      col: "id",
    });

    const enrichedRows = rows.map((row) => {
      const plain = row.get({ plain: true });
      const sellingPrice = parseFloat(plain.product?.selling_price || 0);
      const discountPercentage = parseFloat(plain.discount_percentage || 0);
      const discountAmount = parseFloat(plain.discount_amount || 0);

      let discountedPrice = sellingPrice;
      if (discountPercentage > 0) {
        discountedPrice =
          sellingPrice - (sellingPrice * discountPercentage) / 100;
      } else if (discountAmount > 0) {
        discountedPrice = sellingPrice - discountAmount;
      }

      return {
        ...plain,
        discounted_price: Math.max(0, discountedPrice).toFixed(2),
      };
    });

    res.json({
      success: true,
      data: enrichedRows,
      pagination: {
        current_page: page,
        last_page: Math.ceil(count / limit) || 0,
        total: count,
        per_page: limit,
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Save or update product discounts
 */
exports.saveDiscount = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    let items;
    if (Array.isArray(req.body)) {
      items = req.body;
    } else if (req.body && req.body.discounts) {
      items = Array.isArray(req.body.discounts) ? req.body.discounts : [req.body.discounts];
    } else {
      items = [req.body];
    }

    if (!items.length) {
      await transaction.rollback();
      return res.json({ success: true, message: "No items to save" });
    }

    const isBatch = Array.isArray(req.body) || (req.body && Array.isArray(req.body.discounts));
    const savedItems = [];
    const invalidProdCodes = [];
    const changedBy = req.body?.changed_by || null;
    const ipAddress = req.ip || req.headers?.["x-forwarded-for"] || null;

    for (const itemData of items) {
      const {
        prod_code,
        discount_amount,
        discount_percentage,
        start_date,
        end_date,
        status,
        changed_by,
      } = itemData;

      if (!prod_code) continue;

      const effectiveChangedBy = changed_by ?? changedBy;

      // Check if product exists
      const productExists = await Product.findOne({
        where: { prod_code },
        attributes: ["id"],
        transaction,
      });

      if (!productExists) {
        invalidProdCodes.push(prod_code);
        continue;
      }

      // Clean up duplicate records for same prod_code (from before unique constraint)
      const allExisting = await ProductDiscount.findAll({
        where: { prod_code },
        order: [["id", "ASC"]],
        transaction,
      });

      // Keep the first record, remove duplicates
      const [primaryRecord, ...duplicates] = allExisting;
      if (duplicates.length > 0) {
        await ProductDiscount.destroy({
          where: { id: { [Op.in]: duplicates.map((d) => d.id) } },
          transaction,
        });

        for (const dup of duplicates) {
          await ProductDiscountLog.create(
            {
              product_discount_id: dup.id,
              prod_code: dup.prod_code,
              action: "duplicate_removed",
              old_values: JSON.stringify(dup.get({ plain: true })),
              changed_by: effectiveChangedBy,
              ip_address: ipAddress,
            },
            { transaction },
          );
        }
      }

      // Upsert — create or update the single record
      const [discountItem, created] = primaryRecord
        ? [primaryRecord, false]
        : await ProductDiscount.findOrCreate({
            where: { prod_code },
            defaults: {
              discount_amount,
              discount_percentage,
              start_date,
              end_date,
              status: status ?? 1,
            },
            transaction,
          });

      if (!created) {
        const oldValues = discountItem.get({ plain: true });
        await discountItem.update(
          {
            discount_amount,
            discount_percentage,
            start_date,
            end_date,
            status: status ?? 1,
          },
          { transaction },
        );

        await ProductDiscountLog.create(
          {
            product_discount_id: discountItem.id,
            prod_code,
            action: "updated",
            old_values: JSON.stringify(oldValues),
            new_values: JSON.stringify(discountItem.get({ plain: true })),
            changed_by: effectiveChangedBy,
            ip_address: ipAddress,
          },
          { transaction },
        );
      } else {
        await ProductDiscountLog.create(
          {
            product_discount_id: discountItem.id,
            prod_code,
            action: "created",
            old_values: null,
            new_values: JSON.stringify(discountItem.get({ plain: true })),
            changed_by: effectiveChangedBy,
            ip_address: ipAddress,
          },
          { transaction },
        );
      }

      savedItems.push(discountItem);
    }

    await transaction.commit();

    return res.json({
      success: true,
      message: isBatch
        ? `Successfully saved ${savedItems.length} discount(s)`
        : "Discount saved successfully",
      data: isBatch ? savedItems : savedItems[0],
      invalid_prod_codes: invalidProdCodes.length
        ? invalidProdCodes
        : undefined,
    });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};

/**
 * Delete product discounts
 */
exports.deleteDiscounts = async (req, res, next) => {
  let transaction;

  try {
    let { ids } = req.body;

    if (ids && !Array.isArray(ids)) {
      ids = [ids];
    }

    if (!ids || !ids.length) {
      return res.status(400).json({
        success: false,
        message: "An ID or array of 'ids' is required for deletion.",
      });
    }

    transaction = await sequelize.transaction();

    // Fetch full records before deleting (for audit log)
    const discounts = await ProductDiscount.findAll({
      where: { id: { [Op.in]: ids } },
      transaction,
    });

    if (!discounts.length) {
      await transaction.commit();
      return res.json({
        success: true,
        message: "No matching discounts found.",
        deleted_count: 0,
      });
    }

    const changedBy = req.body?.changed_by || null;
    const ipAddress = req.ip || req.headers?.["x-forwarded-for"] || null;

    // Delete discounts
    const deletedCount = await ProductDiscount.destroy({
      where: { id: { [Op.in]: ids } },
      transaction,
    });

    // Log deletions
    for (const discount of discounts) {
      await ProductDiscountLog.create(
        {
          product_discount_id: discount.id,
          prod_code: discount.prod_code,
          action: "deleted",
          old_values: JSON.stringify(discount.get({ plain: true })),
          new_values: null,
          changed_by: changedBy,
          ip_address: ipAddress,
        },
        { transaction },
      );
    }

    await transaction.commit();

    return res.json({
      success: true,
      message: `${deletedCount} discount(s) deleted successfully.`,
      deleted_count: deletedCount,
    });
  } catch (e) {
    if (transaction) await transaction.rollback();
    next(e);
  }
};
