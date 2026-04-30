const {
  Product,
  ProductDiscount,
  ProductSubCategory,
  SubCategory,
} = require("../../models");
const { Op } = require("sequelize");

/**
 * List product discounts with optional department/category/sub_category filter
 */
exports.list = async (req, res, next) => {
  try {
    const { department, category, sub_category, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const per_page = Math.min(
      200,
      Math.max(1, parseInt(req.query.per_page) || 15),
    );
    const offset = (page - 1) * per_page;

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
      limit: per_page,
      offset,
      distinct: true,
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
        last_page: Math.ceil(count / per_page) || 0,
        total: count,
        per_page,
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
  try {
    const {
      prod_code,
      discount_amount,
      discount_percentage,
      start_date,
      end_date,
      status,
    } = req.body;

    if (!prod_code) {
      return res
        .status(400)
        .json({ success: false, message: "prod_code is required" });
    }

    // Update or Create in ProductDiscount table
    const [item, created] = await ProductDiscount.findOrCreate({
      where: { prod_code },
      defaults: {
        discount_amount,
        discount_percentage,
        start_date,
        end_date,
        status: status ?? 1,
      },
    });

    if (!created) {
      await item.update({
        discount_amount,
        discount_percentage,
        start_date,
        end_date,
        status: status ?? item.status,
      });
    }

    res.json({
      success: true,
      message: "Discount saved successfully",
      data: item,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Delete product discounts (single or bulk)
 */
exports.deleteDiscounts = async (req, res, next) => {
  try {
    let { ids } = req.body;

    // Handle single ID case if passed as a number/string
    if (ids && !Array.isArray(ids)) {
      ids = [ids];
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "An ID or array of 'ids' is required for deletion.",
      });
    }

    // Delete from ProductDiscount table
    const deletedCount = await ProductDiscount.destroy({
      where: { id: { [Op.in]: ids } },
    });

    res.json({
      success: true,
      message: `${deletedCount} discount(s) deleted successfully.`,
      deleted_count: deletedCount,
    });
  } catch (e) {
    next(e);
  }
};
