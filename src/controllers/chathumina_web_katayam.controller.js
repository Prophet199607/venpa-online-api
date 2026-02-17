const { Product, ProductImage, sequelize } = require("../models");
const { enrichProducts } = require("../services/products/enrichProducts");

function resolveLimit(raw, fallback = 10) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), 50);
}

function productIncludes() {
  return [
    {
      model: ProductImage,
      as: "images",
      attributes: { exclude: ["id", "product_id"] },
    },
  ];
}

async function fetchNewArrivalProducts(limit) {
  return Product.findAll({
    order: [["id", "DESC"]],
    limit,
    attributes: { exclude: ["id"] },
    include: productIncludes(),
  });
}

async function fetchBestSellingProducts(limit) {
  return Product.findAll({
    order: sequelize.random(),
    limit,
    attributes: { exclude: ["id"] },
    include: productIncludes(),
  });
}

exports.getProducts = async (req, res, next) => {
  try {
    const sharedLimit = resolveLimit(req.query.limit, 10);
    const bestLimit = resolveLimit(req.query.best_selling_limit, sharedLimit);
    const newLimit = resolveLimit(req.query.new_arrival_limit, sharedLimit);

    const [bestSelling, newArrival] = await Promise.all([
      fetchBestSellingProducts(bestLimit),
      fetchNewArrivalProducts(newLimit),
    ]);

    const [enrichedBestSelling, enrichedNewArrival] = await Promise.all([
      enrichProducts(bestSelling),
      enrichProducts(newArrival),
    ]);

    return res.json({
      best_selling: enrichedBestSelling,
      new_arrival: enrichedNewArrival,
    });
  } catch (e) {
    return next(e);
  }
};
