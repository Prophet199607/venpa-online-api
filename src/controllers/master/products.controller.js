const { Product, ProductImage, sequelize } = require("../../models");

function normalizeImages(images, prodCode) {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === "string") return { prod_code: prodCode, image: img };
      if (img && typeof img.image === "string")
        return { prod_code: prodCode, image: img.image };
      return null;
    })
    .filter(Boolean);
}

exports.list = async (req, res, next) => {
  try {
    const { q, department, category, sub_category } = req.query;

    const where = {};
    if (department) where.department = department;
    if (category) where.category = category;
    if (sub_category) where.sub_category = sub_category;

    // Simple search
    if (q) {
      const { Op } = require("sequelize");
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
      include: [{ model: ProductImage, as: "images", attributes: { exclude: ["id", "product_id"] } }],
    });
    res.json(items);
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
      include: [{ model: ProductImage, as: "images", attributes: { exclude: ["id", "product_id"] } }]
    });
    res.json(items);
  } catch (e) { next(e); }
};

exports.bestSelling = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const items = await Product.findAll({
      order: sequelize.random(),
      limit,
      attributes: { exclude: ["id"] },
      include: [{ model: ProductImage, as: "images", attributes: { exclude: ["id", "product_id"] } }]
    });
    res.json(items);
  } catch (e) { next(e); }
};
exports.getById = async (req, res, next) => {
  try {
    const item = await Product.findOne({
      where: { prod_code: req.params.prod_code },
      attributes: { exclude: ["id"] },
      include: [{ model: ProductImage, as: "images", attributes: { exclude: ["id", "product_id"] } }],
    });
    if (!item) return res.status(404).json({ message: "Product not found" });
    res.json(item);
  } catch (e) {
    next(e);
  }
};
