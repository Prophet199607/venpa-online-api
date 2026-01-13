const { Op } = require("sequelize");
const { Department } = require("../models");

exports.list = async (req, res, next) => {
  try {
    const { q, status } = req.query;
    const where = {};

    if (status !== undefined) {
      const parsed = Number(status);
      where.status = Number.isNaN(parsed) ? status : parsed;
    }

    if (q) {
      where[Op.or] = [
        { dep_code: { [Op.like]: `%${q}%` } },
        { dep_name: { [Op.like]: `%${q}%` } }
      ];
    }

    const items = await Department.findAll({ where, order: [["id", "DESC"]] });
    res.json(items);
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    const item = await Department.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Department not found" });
    res.json(item);
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const created = await Department.create(req.body);
    res.status(201).json(created);
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const item = await Department.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Department not found" });

    await item.update(req.body);
    res.json(item);
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const item = await Department.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Department not found" });

    await item.destroy();
    res.json({ ok: true });
  } catch (e) { next(e); }
};
