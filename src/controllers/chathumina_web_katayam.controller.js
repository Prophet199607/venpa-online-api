const { Product, ProductImage, sequelize } = require("../models");

function resolveLimit(raw, fallback = 10) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), 50);
}

async function fetchNewArrivalProducts(limit) {
  return Product.findAll({
    order: [["id", "DESC"]],
    limit,
    attributes: { exclude: ["id"] },
    include: [
      {
        model: ProductImage,
        as: "images",
        attributes: { exclude: ["id", "product_id"] },
      },
    ],
  });
}

async function fetchBestSellingProducts(limit) {
  return Product.findAll({
    order: sequelize.random(),
    limit,
    attributes: { exclude: ["id"] },
    include: [
      {
        model: ProductImage,
        as: "images",
        attributes: { exclude: ["id", "product_id"] },
      },
    ],
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

    return res.json({
      best_selling: bestSelling,
      new_arrival: newArrival,
    });
  } catch (e) {
    return next(e);
  }
};
