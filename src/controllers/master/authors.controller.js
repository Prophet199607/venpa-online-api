const { Op } = require("sequelize");
const {
  Author,
  Product,
  ProductAuthor,
  ProductImage,
  ProductDiscount,
  Language,
} = require("../../models");
const { enrichProducts } = require("../../services/products/enrichProducts");

function withImageBaseUrl(value) {
  if (!value) return value;
  const raw = String(value).trim();
  if (!raw || /^https?:\/\//i.test(raw)) return raw;
  const base = String(process.env.PRODUCT_IMAGE_BASE_URL || "").trim();
  if (!base) return raw;
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${raw.replace(/^\/+/, "")}`;
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

function normalizeLanguageCode(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toUpperCase();
  return v || null;
}

async function buildAuthorLanguageMap(authors) {
  const codes = [
    ...new Set(
      (authors || [])
        .map((item) => normalizeLanguageCode(item.language))
        .filter(Boolean),
    ),
  ];

  if (!codes.length) return new Map();

  const rows = await Language.findAll({
    where: { lang_code: { [Op.in]: codes } },
    attributes: ["lang_code", "lang_name"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const key = normalizeLanguageCode(row.lang_code);
    if (key) map.set(key, row.lang_name || null);
  }
  return map;
}

function withLanguageName(data, languageMap) {
  if (!data) return data;
  const key = normalizeLanguageCode(data.language);
  data.language_name = key ? languageMap.get(key) || null : null;
  return data;
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
    const languageMap = await buildAuthorLanguageMap(items);
    const result = items.map((item) => {
      const json = item.toJSON();
      if (json.auth_image) json.auth_image = withImageBaseUrl(json.auth_image);
      return withLanguageName(json, languageMap);
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const value = String(req.params.id || "").trim();
    const item = await findAuthorByValue(value);

    if (!item) return res.status(404).json({ message: "Author not found" });
    const result = item.toJSON();
    if (result.auth_image) result.auth_image = withImageBaseUrl(result.auth_image);
    const languageMap = await buildAuthorLanguageMap([item]);
    res.json(withLanguageName(result, languageMap));
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
      const authorData = author.toJSON();
      if (authorData.auth_image) authorData.auth_image = withImageBaseUrl(authorData.auth_image);
      const languageMap = await buildAuthorLanguageMap([author]);
      return res.json({
        author: withLanguageName(authorData, languageMap),
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
    const authorData = author.toJSON();
    if (authorData.auth_image) authorData.auth_image = withImageBaseUrl(authorData.auth_image);
    const languageMap = await buildAuthorLanguageMap([author]);
    return res.json({
      author: withLanguageName(authorData, languageMap),
      books,
    });
  } catch (e) {
    next(e);
  }
};
