const { Op } = require("sequelize");
const { Publisher, Product, ProductImage, ProductDiscount, Language } = require("../../models");
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

async function findPublisherByValue(value) {
  const numericId = Number(value);
  return Publisher.findOne({
    where:
      Number.isInteger(numericId) && /^\d+$/.test(value)
        ? { id: numericId }
        : { pub_code: value },
  });
}

function normalizeLanguageCode(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toUpperCase();
  return v || null;
}

async function buildPublisherLanguageMap(publishers) {
  const codes = [
    ...new Set(
      (publishers || [])
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
    const languageMap = await buildPublisherLanguageMap(items);
    const result = items.map((item) => {
      const json = item.toJSON();
      if (json.pub_image) json.pub_image = withImageBaseUrl(json.pub_image);
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
    const item = await findPublisherByValue(value);

    if (!item) return res.status(404).json({ message: "Publisher not found" });
    const result = item.toJSON();
    if (result.pub_image) result.pub_image = withImageBaseUrl(result.pub_image);
    const languageMap = await buildPublisherLanguageMap([item]);
    res.json(withLanguageName(result, languageMap));
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
    const publisherData = publisher.toJSON();
    if (publisherData.pub_image) publisherData.pub_image = withImageBaseUrl(publisherData.pub_image);
    const languageMap = await buildPublisherLanguageMap([publisher]);
    return res.json({
      publisher: withLanguageName(publisherData, languageMap),
      books,
    });
  } catch (e) {
    next(e);
  }
};
