const { Op, QueryTypes } = require("sequelize");
const {
  Product,
  ProductImage,
  Review,
  StockMaster,
  sequelize,
} = require("../../models");
const sequelizeSource = require("../../config/sourceDb");
const { enrichProducts } = require("../../services/products/enrichProducts");

function normalizeLocationCode(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function pickTableColumn(columns, candidates) {
  if (!columns) return null;

  for (const candidate of candidates) {
    if (candidate && Object.prototype.hasOwnProperty.call(columns, candidate)) {
      return candidate;
    }
  }

  return null;
}

async function queryLocationNameMap(db, locationCodes) {
  if (!locationCodes.length) return new Map();

  let columns = null;
  try {
    columns = await db.getQueryInterface().describeTable("locations");
  } catch (err) {
    return new Map();
  }

  const codeColumn = pickTableColumn(columns, [
    process.env.LOCATION_CODE_COLUMN,
    "location",
    "loc_code",
    "location_code",
    "code",
  ]);
  const nameColumn = pickTableColumn(columns, [
    process.env.LOCATION_NAME_COLUMN,
    "location_name",
    "loc_name",
    "name",
  ]);

  if (!codeColumn) return new Map();

  const rows = await db.query(
    `SELECT \`${codeColumn}\` AS location_code${
      nameColumn ? `, \`${nameColumn}\` AS location_name` : ""
    } FROM \`locations\` WHERE \`${codeColumn}\` IN (:locationCodes)`,
    {
      replacements: { locationCodes },
      type: QueryTypes.SELECT,
    }
  );

  const map = new Map();
  for (const row of rows) {
    const code = normalizeLocationCode(row.location_code);
    if (!code) continue;
    map.set(code, row.location_name || null);
  }

  return map;
}

async function buildLocationNameMap(locationCodes) {
  const normalizedCodes = [...new Set(locationCodes.map(normalizeLocationCode).filter(Boolean))];
  if (!normalizedCodes.length) return new Map();

  const localMap = await queryLocationNameMap(sequelize, normalizedCodes);
  if (localMap.size) return localMap;

  return queryLocationNameMap(sequelizeSource, normalizedCodes);
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

exports.pickAndCollectLocations = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: { prod_code: req.params.prod_code },
      attributes: { exclude: ["id"] },
      include: productIncludes(),
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const locations = await StockMaster.findAll({
      where: {
        prod_code: req.params.prod_code,
        location: {
          [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
        },
      },
      attributes: [
        "location",
        [sequelize.fn("SUM", sequelize.col("qty")), "available_qty"],
      ],
      group: ["location"],
      having: sequelize.where(sequelize.fn("SUM", sequelize.col("qty")), {
        [Op.gt]: 0,
      }),
      order: [["location", "ASC"]],
      raw: true,
    });

    const enriched = await enrichProducts([product]);
    const locationNameMap = await buildLocationNameMap(
      locations.map((item) => item.location)
    );

    res.json({
      product: enriched[0] || null,
      locations: locations.map((item) => ({
        location: item.location,
        location_name:
          locationNameMap.get(normalizeLocationCode(item.location)) || null,
        available_qty: Number(item.available_qty || 0),
      })),
    });
  } catch (e) {
    next(e);
  }
};
