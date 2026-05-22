const { Op } = require("sequelize");
const {
  Product,
  ProductSubCategory,
  ProductImage,
  Review,
  Location,
  StockMaster,
  SubCategory,
  ProductDiscount,
  WebsiteSectionProduct,
  sequelize,
} = require("../../models");
const { enrichProducts } = require("../../services/products/enrichProducts");

function normalizeLocationCode(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

async function buildLocationMap(locationCodes) {
  const normalizedCodes = [
    ...new Set(locationCodes.map(normalizeLocationCode).filter(Boolean)),
  ];
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
    {
      model: ProductDiscount,
      as: "productDiscounts",
      attributes: { exclude: ["id", "prod_code"] },
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

function getPriceRangeWhere(rangeQuery) {
  if (!rangeQuery) return {};

  const cleanRange = rangeQuery.toLowerCase().trim();

  if (cleanRange === "upto 5000" || cleanRange === "5000+") {
    return { selling_price: { [Op.gte]: 5000 } };
  }

  const parts = cleanRange.split("-");
  if (parts.length === 2) {
    const min = parseFloat(parts[0]);
    const max = parseFloat(parts[1]);
    if (!isNaN(min) && !isNaN(max)) {
      return { selling_price: { [Op.between]: [min, max] } };
    }
  }

  return {};
}

function getPriceRangeSql(rangeQuery) {
  if (!rangeQuery) return "";

  const cleanRange = rangeQuery.toLowerCase().trim();

  if (cleanRange === "upto 5000" || cleanRange === "5000+") {
    return "AND p.selling_price >= 5000";
  }

  const parts = cleanRange.split("-");
  if (parts.length === 2) {
    const min = parseFloat(parts[0]);
    const max = parseFloat(parts[1]);
    if (!isNaN(min) && !isNaN(max)) {
      return `AND p.selling_price BETWEEN ${min} AND ${max}`;
    }
  }

  return "";
}

/**
 * Generic helper to fetch products based on WebsiteSectionProduct mapping
 */
const getProductsBySectionType = async (type, limit, priceRange) => {
  const sectionProducts = await WebsiteSectionProduct.findAll({
    where: { section_type: type },
    order: [["position", "ASC"]],
    limit: limit,
    attributes: ["prod_code"],
  });

  if (sectionProducts.length === 0) return [];

  const codes = sectionProducts.map((sp) => sp.prod_code);

  const where = { prod_code: { [Op.in]: codes } };
  if (priceRange) {
    Object.assign(where, getPriceRangeWhere(priceRange));
  }

  const items = await Product.findAll({
    where,
    order: [
      [
        sequelize.literal(
          `FIELD(products.prod_code, ${codes.map((c) => sequelize.escape(c)).join(",")})`,
        ),
        "ASC",
      ],
    ],
    include: productIncludes(),
  });

  return await enrichProducts(items);
};

exports.list = async (req, res, next) => {
  try {
    const { q, department, category, sub_category, price_range } = req.query;
    const frame = resolveFrame(req.query.frame || req.query.page);
    const limit = resolveFrameSize(req.query.limit);
    const offset = (frame - 1) * limit;

    const where = {};
    if (price_range) {
      Object.assign(where, getPriceRangeWhere(price_range));
    }
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
      // Find prod_codes whose authors match the query
      const authorMatchedCodes = await sequelize.query(
        `SELECT DISTINCT pa.prod_code
         FROM product_authors pa
         INNER JOIN authors a ON a.auth_code = pa.auth_code
         WHERE a.auth_name LIKE :q OR a.auth_name_other_language LIKE :q`,
        {
          replacements: { q: `%${q}%` },
          type: sequelize.QueryTypes.SELECT,
        },
      );
      const authorProdCodes = authorMatchedCodes.map((r) => r.prod_code);

      where[Op.or] = [
        { prod_code: { [Op.like]: `%${q}%` } },
        { prod_name: { [Op.like]: `%${q}%` } },
        { isbn: { [Op.like]: `%${q}%` } },
        ...(authorProdCodes.length
          ? [{ prod_code: { [Op.in]: authorProdCodes } }]
          : []),
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
        order: [
          [
            sequelize.literal(
              "EXISTS(SELECT 1 FROM product_discounts WHERE product_discounts.prod_code = products.prod_code AND product_discounts.status = 1)",
            ),
            "DESC",
          ],
          ["id", "DESC"],
        ],
        limit,
        offset,
        include: itemInclude,
      }),
    ]);

    const totalFrames =
      totalProducts > 0 ? Math.ceil(totalProducts / limit) : 0;

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

    // Find prod_codes whose authors match the query
    const authorMatchedCodes = await sequelize.query(
      `SELECT DISTINCT pa.prod_code
       FROM product_authors pa
       INNER JOIN authors a ON a.auth_code = pa.auth_code
       WHERE a.auth_name LIKE :q OR a.auth_name_other_language LIKE :q`,
      {
        replacements: { q: `%${q}%` },
        type: sequelize.QueryTypes.SELECT,
      },
    );
    const authorProdCodes = authorMatchedCodes.map((r) => r.prod_code);

    const items = await Product.findAll({
      where: {
        [Op.or]: [
          { prod_code: { [Op.like]: `%${q}%` } },
          { prod_name: { [Op.like]: `%${q}%` } },
          { isbn: { [Op.like]: `%${q}%` } },
          ...(authorProdCodes.length
            ? [{ prod_code: { [Op.in]: authorProdCodes } }]
            : []),
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
    const { price_range } = req.query;

    /* Commented out old database-driven logic
    const sourceDbName = process.env.MYSQL_SOURCE_DB;
    const where = {
      prod_code: {
        [Op.in]: sequelize.literal(
          `(SELECT prod_code COLLATE utf8mb4_unicode_ci FROM ${sourceDbName}.stock_masters GROUP BY prod_code HAVING SUM(qty) > 0)`,
        ),
      },
    };
    if (price_range) {
      Object.assign(where, getPriceRangeWhere(price_range));
    }
    const items = await Product.findAll({
      where,
      order: [["id", "DESC"]],
      limit,
      include: productIncludes(),
    });
    res.json(await enrichProducts(items));
    */

    const items = await getProductsBySectionType(
      "new-arrival",
      limit,
      price_range,
    );
    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.specialOffers = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 20), 50);
    const { price_range } = req.query;
    const nowStr = new Date().toISOString().slice(0, 10);

    const baseIncludes = productIncludes().filter(
      (inc) => inc.as !== "productDiscounts",
    );

    const where = {};
    if (price_range) {
      Object.assign(where, getPriceRangeWhere(price_range));
    }

    const items = await Product.findAll({
      where,
      order: [["id", "DESC"]],
      limit,
      include: [
        ...baseIncludes,
        {
          model: ProductDiscount,
          as: "productDiscounts",
          required: true,
          where: {
            status: 1,
            [Op.and]: [
              {
                [Op.or]: [
                  { start_date: null },
                  { start_date: "" },
                  { start_date: { [Op.lte]: nowStr } },
                ],
              },
              {
                [Op.or]: [
                  { end_date: null },
                  { end_date: "" },
                  { end_date: { [Op.gte]: nowStr } },
                ],
              },
            ],
          },
        },
      ],
    });

    res.json(await enrichProducts(items));
  } catch (e) {
    next(e);
  }
};

exports.topKidsBooks = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const { price_range } = req.query;

    /* Commented out old database-driven logic
    const sourceDbName = process.env.MYSQL_SOURCE_DB;
    const where = {
      category: "1004",
      prod_code: {
        [Op.in]: sequelize.literal(
          `(SELECT prod_code COLLATE utf8mb4_unicode_ci FROM ${sourceDbName}.stock_masters GROUP BY prod_code HAVING SUM(qty) > 0)`,
        ),
      },
    };
    if (price_range) {
      Object.assign(where, getPriceRangeWhere(price_range));
    }
    const items = await Product.findAll({
      where,
      order: [["id", "DESC"]],
      limit,
      include: productIncludes(),
    });
    res.json(await enrichProducts(items));
    */

    const items = await getProductsBySectionType(
      "top-kids",
      limit,
      price_range,
    );
    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.bestSelling = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const { price_range } = req.query;

    /* Commented out old database-driven logic
    const sourceDbName = process.env.MYSQL_SOURCE_DB;
    const priceWhereSql = getPriceRangeSql(price_range);
    const topSellingCodes = await sequelize.query(
      `SELECT sm.prod_code 
       FROM ${sourceDbName}.stock_masters sm
       JOIN products p ON p.prod_code = sm.prod_code COLLATE utf8mb4_unicode_ci
       WHERE 1=1 ${priceWhereSql}
       GROUP BY sm.prod_code 
       HAVING SUM(sm.qty) > 0 
       ORDER BY 
          ABS(SUM(CASE WHEN sm.iid = 'ONL' THEN sm.qty ELSE 0 END)) DESC, 
          ABS(SUM(sm.qty)) DESC
       LIMIT :limit`,
      {
        replacements: { limit: limit },
        type: sequelize.QueryTypes.SELECT,
      },
    );
    if (!topSellingCodes || topSellingCodes.length === 0) {
      return res.json([]);
    }
    const codes = topSellingCodes.map((r) => r.prod_code);
    const where = {
      prod_code: { [Op.in]: codes },
    };
    if (price_range) {
      Object.assign(where, getPriceRangeWhere(price_range));
    }
    const items = await Product.findAll({
      where,
      order: [
        [
          sequelize.literal(
            `FIELD(products.prod_code, ${codes.map((c) => sequelize.escape(c)).join(",")})`,
          ),
          "ASC",
        ],
      ],
      limit,
      include: productIncludes(),
    });
    res.json(await enrichProducts(items));
    */

    const items = await getProductsBySectionType(
      "top-selling",
      limit,
      price_range,
    );
    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.newReleases = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const { price_range } = req.query;
    const items = await getProductsBySectionType(
      "new-release",
      limit,
      price_range,
    );
    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.mostSelling = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 15), 50);
    const sourceDbName = process.env.MYSQL_SOURCE_DB;

    // Fetch top selling prod_codes based on qty for ONL, WEB, APP
    const topSellingCodes = await sequelize.query(
      `SELECT sm.prod_code 
       FROM ${sourceDbName}.stock_masters sm
       JOIN products p ON p.prod_code = sm.prod_code COLLATE utf8mb4_unicode_ci
       GROUP BY sm.prod_code 
       HAVING SUM(sm.qty) > 0 
       ORDER BY ABS(SUM(CASE WHEN sm.iid IN ('ONL', 'WEB', 'APP') THEN sm.qty ELSE 0 END)) DESC
       LIMIT :limit`,
      {
        replacements: { limit: limit },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    if (!topSellingCodes || topSellingCodes.length === 0) {
      return res.json([]);
    }

    const codes = topSellingCodes.map((r) => r.prod_code);

    const items = await Product.findAll({
      where: { prod_code: { [Op.in]: codes } },
      order: [
        [
          sequelize.literal(
            `FIELD(products.prod_code, ${codes.map((c) => sequelize.escape(c)).join(",")})`,
          ),
          "ASC",
        ],
      ],
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
        [
          StockMaster.sequelize.fn("SUM", StockMaster.sequelize.col("qty")),
          "available_qty",
        ],
      ],
      group: ["location"],
      having: StockMaster.sequelize.where(
        StockMaster.sequelize.fn("SUM", StockMaster.sequelize.col("qty")),
        {
          [Op.gt]: 0,
        },
      ),
      order: [["location", "ASC"]],
      raw: true,
    });

    const enriched = await enrichProducts([product]);
    const locationMap = await buildLocationMap(
      locations.map((item) => item.location),
    );

    res.json({
      product: enriched[0] || null,
      locations: locations.map((item) => ({
        location: item.location,
        location_name:
          locationMap.get(normalizeLocationCode(item.location))?.loca_name ||
          null,
        available_qty: Number(item.available_qty || 0),
        location_details:
          locationMap.get(normalizeLocationCode(item.location)) || null,
      })),
    });
  } catch (e) {
    next(e);
  }
};
