const { Op } = require("sequelize");
const {
  Product,
  ProductSubCategory,
  ProductImage,
  Review,
  Location,
  StockMaster,
  SubCategory,
  sequelize,
} = require("../../models");
const { enrichProducts } = require("../../services/products/enrichProducts");

function normalizeLocationCode(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

async function buildLocationMap(locationCodes) {
  const normalizedCodes = [...new Set(locationCodes.map(normalizeLocationCode).filter(Boolean))];
  if (!normalizedCodes.length) return new Map();

  const rows = await Location.findAll({
    where: { loca_code: { [Op.in]: normalizedCodes } },
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const code = normalizeLocationCode(row.loca_code);
    if (!code) continue;
    map.set(code, row);
  }

  return map;
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

function resolveFrame(rawValue) {
  const parsed = Number(rawValue || 1);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

function resolveFrameSize(rawValue) {
  const parsed = Number(rawValue || 100);
  if (!Number.isFinite(parsed) || parsed < 1) return 100;
  return Math.min(Math.trunc(parsed), 200);
}

exports.list = async (req, res, next) => {
  try {
    const { q, department, category, sub_category } = req.query;
    const frame = resolveFrame(req.query.frame || req.query.page);
    const limit = resolveFrameSize(req.query.limit);
    const offset = (frame - 1) * limit;

    const where = {};
    const countInclude = [];
    const itemInclude = productIncludes();
    if (department) where.department = department;
    if (category) where.category = category;

    if (sub_category) {
      const subCategoryRow = await SubCategory.findOne({
        where: { scat_code: sub_category },
        attributes: ["id"],
        raw: true,
      });

      if (!subCategoryRow) {
        return res.json({
          frame,
          per_frame: limit,
          total_products: 0,
          total_frames: 0,
          products: [],
        });
      }

      const subCategoryInclude = {
        model: ProductSubCategory,
        as: "productSubCategories",
        where: { sub_category_id: subCategoryRow.id },
        attributes: [],
        required: true,
      };

      countInclude.push(subCategoryInclude);
      itemInclude.push(subCategoryInclude);
    }

    if (q) {
      where[Op.or] = [
        { prod_code: { [Op.like]: `%${q}%` } },
        { prod_name: { [Op.like]: `%${q}%` } },
        { isbn: { [Op.like]: `%${q}%` } },
      ];
    }

    const [totalProducts, items] = await Promise.all([
      Product.count({
        where,
        include: countInclude,
        distinct: true,
        col: "id",
      }),
      Product.findAll({
        where,
        order: [["id", "DESC"]],
        limit,
        offset,
        include: itemInclude,
      }),
    ]);

    const totalFrames = totalProducts > 0 ? Math.ceil(totalProducts / limit) : 0;

    res.json({
      frame,
      per_frame: limit,
      total_products: totalProducts,
      total_frames: totalFrames,
      products: await enrichProducts(items),
    });
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
        [StockMaster.sequelize.fn("SUM", StockMaster.sequelize.col("qty")), "available_qty"],
      ],
      group: ["location"],
      having: StockMaster.sequelize.where(StockMaster.sequelize.fn("SUM", StockMaster.sequelize.col("qty")), {
        [Op.gt]: 0,
      }),
      order: [["location", "ASC"]],
      raw: true,
    });

    const enriched = await enrichProducts([product]);
    const locationMap = await buildLocationMap(
      locations.map((item) => item.location)
    );

    res.json({
      product: enriched[0] || null,
      locations: locations.map((item) => ({
        location: item.location,
        location_name:
          locationMap.get(normalizeLocationCode(item.location))?.loca_name || null,
        available_qty: Number(item.available_qty || 0),
        location_details:
          locationMap.get(normalizeLocationCode(item.location)) || null,
      })),
    });
  } catch (e) {
    next(e);
  }
};
