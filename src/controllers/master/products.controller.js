const { Op } = require("sequelize");
const { Product, ProductImage, Review, sequelize } = require("../../models");
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

exports.list = async (req, res, next) => {
  try {
    const { q, department, category, sub_category } = req.query;

    const where = {};
    if (department) where.department = department;
    if (category) where.category = category;
    if (sub_category) where.sub_category = sub_category;

    if (q) {
      where[Op.or] = [
        { prod_code: { [Op.like]: `%${q}%` } },
        { prod_name: { [Op.like]: `%${q}%` } },
        { isbn: { [Op.like]: `%${q}%` } },
      ];
    }

    const items = await Product.findAll({
      where,
      order: [["id", "DESC"]],
      attributes: { exclude: ["id"] },
      include: productIncludes(),
    });

    res.json(await enrichProducts(items));
  } catch (e) {
    next(e);
  }
};

exports.search = async (req, res, next) => {
  try {
    const q = (req.query.q || req.query.query || "").toString().trim();
    if (!q) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const items = await Product.findAll({
      where: {
        [Op.or]: [
          { prod_code: { [Op.like]: `%${q}%` } },
          { prod_name: { [Op.like]: `%${q}%` } },
          { isbn: { [Op.like]: `%${q}%` } },
        ],
      },
      order: [["id", "DESC"]],
      attributes: { exclude: ["id"] },
      include: productIncludes(),
    });

    res.json(await enrichProducts(items));
  } catch (e) {
    next(e);
  }
};

exports.newArrivals = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const items = await Product.findAll({
      order: [["id", "DESC"]],
      limit,
      attributes: { exclude: ["id"] },
      include: productIncludes(),
    });

    res.json(await enrichProducts(items));
  } catch (e) {
    next(e);
  }
};

exports.bestSelling = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const items = await Product.findAll({
      order: sequelize.random(),
      limit,
      attributes: { exclude: ["id"] },
      include: productIncludes(),
    });

    res.json(await enrichProducts(items));
  } catch (e) {
    next(e);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: { prod_code: req.params.prod_code },
      attributes: { exclude: ["id"] },
      include: productIncludes(),
    });
    if (!product) return res.status(404).json({ message: "Product not found" });

    let reviews = [];
    try {
      reviews = await Review.findAll({
        where: { product_id: product.id },
        attributes: { exclude: ["id", "product_id", "user_id"] },
        order: [["created_at", "DESC"]],
      });
    } catch (err) {
      console.warn("Reviews fetch failed:", err.message);
      reviews = [];
    }

    const enriched = await enrichProducts([product]);
    res.json({
      product: enriched[0] || null,
      reviews,
    });
  } catch (e) {
    next(e);
  }
};
