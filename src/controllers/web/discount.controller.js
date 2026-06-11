const {
  Product,
  ProductDiscount,
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

    for (const itemData of items) {
      const {
        prod_code,
        discount_amount,
        discount_percentage,
        start_date,
        end_date,
        status,
      } = itemData;

      if (!prod_code) continue;

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

      // Create or update discount
      const [discountItem, created] = await ProductDiscount.findOrCreate({
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

    // Normalize input
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

    // Get discounts first
    const discounts = await ProductDiscount.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ["prod_code"],
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

    // Delete discounts
    const deletedCount = await ProductDiscount.destroy({
      where: { id: { [Op.in]: ids } },
      transaction,
    });

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
