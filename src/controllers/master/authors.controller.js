const { Op } = require("sequelize");
const { Author, Product, ProductAuthor, ProductImage } = require("../../models");
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

async function findAuthorByValue(value) {
  const numericId = Number(value);
  return Author.findOne({
    where:
      Number.isInteger(numericId) && /^\d+$/.test(value)
        ? { id: numericId }
        : { auth_code: value },
  });
}

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
    const item = await findAuthorByValue(value);

    if (!item) return res.status(404).json({ message: "Author not found" });
    res.json(item);
  } catch (e) {
    next(e);
  }
};

exports.getBooks = async (req, res, next) => {
  try {
    const value = String(req.params.id || "").trim();
    const author = await findAuthorByValue(value);

    if (!author) {
      return res.status(404).json({ message: "Author not found" });
    }

    let links = [];
    try {
      links = await ProductAuthor.findAll({
        where: { author_id: author.id },
        attributes: ["prod_code"],
        raw: true,
      });
    } catch (err) {
      links = [];
    }

    if (!links.length && author.auth_code) {
      try {
        links = await ProductAuthor.findAll({
          where: { auth_code: author.auth_code },
          attributes: ["prod_code"],
          raw: true,
        });
      } catch (err) {
        links = links || [];
      }
    }

    const prodCodes = [...new Set(links.map((item) => item.prod_code).filter(Boolean))];
    if (!prodCodes.length) {
      return res.json({
        author,
        books: [],
      });
    }

    const products = await Product.findAll({
      where: { prod_code: { [Op.in]: prodCodes } },
      order: [["id", "DESC"]],
      attributes: { exclude: ["id"] },
      include: productIncludes(),
    });

    const books = await enrichProducts(products);
    return res.json({
      author,
      books,
    });
  } catch (e) {
    next(e);
  }
};
