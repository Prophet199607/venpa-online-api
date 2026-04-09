const { Op } = require("sequelize");
const { Publisher, Product, ProductImage } = require("../../models");
const { enrichProducts } = require("../../services/products/enrichProducts");

function productIncludes() {
  return [
    {
      model: ProductImage,
      as: "images",
      attributes: { exclude: ["id", "product_id"] },
    },
  ];
}

async function findPublisherByValue(value) {
  const numericId = Number(value);
  return Publisher.findOne({
    where:
      Number.isInteger(numericId) && /^\d+$/.test(value)
        ? { id: numericId }
        : { pub_code: value },
  });
}

exports.list = async (req, res, next) => {
  try {
    const { q, status, pub_code } = req.query;
    const where = {};

    if (pub_code) where.pub_code = pub_code;

    if (status !== undefined) {
      const parsed = Number(status);
      where.status = Number.isNaN(parsed) ? status : parsed;
    }

    if (q) {
      where[Op.or] = [
        { pub_code: { [Op.like]: `%${q}%` } },
        { pub_name: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
        { contact: { [Op.like]: `%${q}%` } },
      ];
    }

    const items = await Publisher.findAll({ where, order: [["id", "DESC"]] });
    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const value = String(req.params.id || "").trim();
    const item = await findPublisherByValue(value);

    if (!item) return res.status(404).json({ message: "Publisher not found" });
    res.json(item);
  } catch (e) {
    next(e);
  }
};

exports.getBooks = async (req, res, next) => {
  try {
    const value = String(req.params.id || "").trim();
    const publisher = await findPublisherByValue(value);

    if (!publisher) {
      return res.status(404).json({ message: "Publisher not found" });
    }

    const products = await Product.findAll({
      where: { publisher: publisher.pub_code },
      order: [["id", "DESC"]],
      attributes: { exclude: ["id"] },
      include: productIncludes(),
    });

    const books = await enrichProducts(products);
    return res.json({
      publisher,
      books,
    });
  } catch (e) {
    next(e);
  }
};
