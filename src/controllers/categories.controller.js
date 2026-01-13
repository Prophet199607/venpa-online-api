const { Op } = require("sequelize");
const { Category } = require("../models");

exports.list = async (req, res, next) => {
  try {
    const { q, department, status, cat_code } = req.query;
    const where = {};

    if (department) where.department = department;
    if (cat_code) where.cat_code = cat_code;

    if (status !== undefined) {
      const parsed = Number(status);
      where.status = Number.isNaN(parsed) ? status : parsed;
    }

    if (q) {
      where[Op.or] = [
        { cat_code: { [Op.like]: `%${q}%` } },
        { cat_name: { [Op.like]: `%${q}%` } },
      ];
    }

    const items = await Category.findAll({ where, order: [["id", "DESC"]] });
    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const item = await Category.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Category not found" });
    res.json(item);
  } catch (e) {
    next(e);
  }
};
