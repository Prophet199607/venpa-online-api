const { Op } = require("sequelize");
const { Author } = require("../../models");

exports.list = async (req, res, next) => {
  try {
    const { q, status, auth_code } = req.query;
    const where = {};

    if (auth_code) where.auth_code = auth_code;

    if (status !== undefined) {
      const parsed = Number(status);
      where.status = Number.isNaN(parsed) ? status : parsed;
    }

    if (q) {
      where[Op.or] = [
        { auth_code: { [Op.like]: `%${q}%` } },
        { auth_name: { [Op.like]: `%${q}%` } },
        { auth_name_other_1: { [Op.like]: `%${q}%` } },
      ];
    }

    const items = await Author.findAll({ where, order: [["id", "DESC"]] });
    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const value = String(req.params.id || "").trim();
    const numericId = Number(value);

    const item = await Author.findOne({
      where:
        Number.isInteger(numericId) && /^\d+$/.test(value)
          ? { id: numericId }
          : { auth_code: value },
    });

    if (!item) return res.status(404).json({ message: "Author not found" });
    res.json(item);
  } catch (e) {
    next(e);
  }
};
