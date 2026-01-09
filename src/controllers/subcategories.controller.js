const { Op } = require("sequelize");
const { SubCategory } = require("../models");

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
        { scat_code: { [Op.like]: `%${q}%` } },
        { scat_name: { [Op.like]: `%${q}%` } }
      ];
    }

    const items = await SubCategory.findAll({ where, order: [["id", "DESC"]] });
    res.json(items);
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    const item = await SubCategory.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Subcategory not found" });
    res.json(item);
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const created = await SubCategory.create(req.body);
    res.status(201).json(created);
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const item = await SubCategory.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Subcategory not found" });

    await item.update(req.body);
    res.json(item);
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const item = await SubCategory.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Subcategory not found" });

    await item.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
};
