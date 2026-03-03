const { Op } = require("sequelize");
const { SubCategory, ProductSubCategory } = require("../../models");

exports.list = async (req, res, next) => {
  try {
    const { q, department, status, cat_code, prod_code } = req.query;
    const where = {};

    if (department) where.department = department;
    if (cat_code) where.cat_code = cat_code;

    if (status !== undefined) {
      const parsed = Number(status);
      where.status = Number.isNaN(parsed) ? status : parsed;
    }

    if (q) {
      where[Op.or] = [
        { scat_code: { [Op.like]: `%${q}%` } },
        { scat_name: { [Op.like]: `%${q}%` } },
      ];
    }

    let items;
    if (prod_code) {
      items = await SubCategory.findAll({
        where,
        include: [
          {
            model: ProductSubCategory,
            as: "productSubCategories",
            where: { prod_code },
            attributes: [],
            required: true,
          },
        ],
        order: [["id", "DESC"]],
      });
    } else {
      items = await SubCategory.findAll({ where, order: [["id", "DESC"]] });
    }

    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const value = String(req.params.id || "").trim();
    const linkedItems = await SubCategory.findAll({
      where: { cat_code: value },
      order: [["id", "DESC"]],
    });

    if (linkedItems.length) {
      return res.json(linkedItems);
    }

    const numericId = Number(value);
    const item = await SubCategory.findOne({
      where:
        Number.isInteger(numericId) && /^\d+$/.test(value)
          ? { id: numericId }
          : { scat_code: value },
    });

    if (!item) {
      return res.status(404).json({ message: "Subcategory not found" });
    }
    return res.json(item);
  } catch (e) {
    next(e);
  }
};
