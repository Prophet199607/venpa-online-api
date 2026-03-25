const { Op, fn, col } = require("sequelize");
const {
  Department,
  Category,
  SubCategory,
  Publisher,
  BookType,
  Author,
  Language,
  StockMaster,
  ProductAuthor,
} = require("../../models");

function normalizeCode(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toUpperCase();
  return v || null;
}

function toPlainProducts(items) {
  return items.map((item) => (item?.toJSON ? item.toJSON() : item));
}

async function buildPublisherMap(products) {
  const codes = [
    ...new Set(products.map((item) => normalizeCode(item.publisher)).filter(Boolean)),
  ];

  if (!codes.length) return new Map();

  const rows = await Publisher.findAll({
    where: { pub_code: { [Op.in]: codes } },
    attributes: ["pub_code", "pub_name"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const key = normalizeCode(row.pub_code);
    if (key) map.set(key, row.pub_name || null);
  }
  return map;
}

async function buildDepartmentMap(products) {
  const codes = [
    ...new Set(products.map((item) => normalizeCode(item.department)).filter(Boolean)),
  ];

  if (!codes.length) return new Map();

  const rows = await Department.findAll({
    where: { dep_code: { [Op.in]: codes } },
    attributes: ["dep_code", "dep_name"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const key = normalizeCode(row.dep_code);
    if (key) map.set(key, row.dep_name || null);
  }
  return map;
}

async function buildCategoryMap(products) {
  const codes = [
    ...new Set(products.map((item) => normalizeCode(item.category)).filter(Boolean)),
  ];

  if (!codes.length) return new Map();

  const rows = await Category.findAll({
    where: { cat_code: { [Op.in]: codes } },
    attributes: ["cat_code", "cat_name"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const key = normalizeCode(row.cat_code);
    if (key) map.set(key, row.cat_name || null);
  }
  return map;
}

async function buildSubCategoryMap(products) {
  const codes = [
    ...new Set(products.map((item) => normalizeCode(item.sub_category)).filter(Boolean)),
  ];

  if (!codes.length) return new Map();

  const rows = await SubCategory.findAll({
    where: { scat_code: { [Op.in]: codes } },
    attributes: ["scat_code", "scat_name"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const key = normalizeCode(row.scat_code);
    if (key) map.set(key, row.scat_name || null);
  }
  return map;
}

async function buildAuthorNamesByProductMap(products) {
  const prodCodes = [
    ...new Set(products.map((item) => normalizeCode(item.prod_code)).filter(Boolean)),
  ];

  if (!prodCodes.length) return new Map();

  let links = [];
  try {
    links = await ProductAuthor.findAll({
      where: { prod_code: { [Op.in]: prodCodes } },
      attributes: ["prod_code", "author_id", "auth_code"],
      raw: true,
    });
  } catch (err) {
    // Some schemas have no auth_code in product_authors; fallback to author_id path.
    links = await ProductAuthor.findAll({
      where: { prod_code: { [Op.in]: prodCodes } },
      attributes: ["prod_code", "author_id"],
      raw: true,
    });
    links = links.map((row) => ({ ...row, auth_code: null }));
  }

  if (!links.length) return new Map();

  const authorIds = [...new Set(links.map((l) => l.author_id).filter(Boolean))];
  const authCodes = [
    ...new Set(links.map((l) => normalizeCode(l.auth_code)).filter(Boolean)),
  ];

  const [authorsByIdRows, authorsByCodeRows] = await Promise.all([
    authorIds.length
      ? Author.findAll({
          where: { id: { [Op.in]: authorIds } },
          attributes: ["id", "auth_name"],
          raw: true,
        })
      : Promise.resolve([]),
    authCodes.length
      ? Author.findAll({
          where: { auth_code: { [Op.in]: authCodes } },
          attributes: ["auth_code", "auth_name"],
          raw: true,
        })
      : Promise.resolve([]),
  ]);

  const authorNameById = new Map();
  for (const row of authorsByIdRows) {
    authorNameById.set(Number(row.id), row.auth_name || null);
  }

  const authorNameByCode = new Map();
  for (const row of authorsByCodeRows) {
    const key = normalizeCode(row.auth_code);
    if (key) authorNameByCode.set(key, row.auth_name || null);
  }

  const namesByProduct = new Map();
  for (const link of links) {
    const productCode = normalizeCode(link.prod_code);
    if (!productCode) continue;

    const nameFromId = link.author_id ? authorNameById.get(Number(link.author_id)) : null;
    const nameFromCode = normalizeCode(link.auth_code)
      ? authorNameByCode.get(normalizeCode(link.auth_code))
      : null;
    const authorName = nameFromId || nameFromCode || null;

    if (!authorName) continue;

    const existing = namesByProduct.get(productCode) || [];
    if (!existing.includes(authorName)) {
      existing.push(authorName);
      namesByProduct.set(productCode, existing);
    }
  }

  return namesByProduct;
}

async function buildBookTypeMap(products) {
  const codes = [
    ...new Set(products.map((item) => normalizeCode(item.book_type)).filter(Boolean)),
  ];

  if (!codes.length) return new Map();

  const rows = await BookType.findAll({
    where: { book_type: { [Op.in]: codes } },
    attributes: ["book_type", "book_type_name"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const key = normalizeCode(row.book_type);
    if (key) map.set(key, row.book_type_name || null);
  }
  return map;
}

async function buildLanguageMap(products) {
  const codes = [
    ...new Set(products.map((item) => normalizeCode(item.language)).filter(Boolean)),
  ];

  if (!codes.length) return new Map();

  const rows = await Language.findAll({
    where: { lang_code: { [Op.in]: codes } },
    attributes: ["lang_code", "lang_name"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const key = normalizeCode(row.lang_code);
    if (key) map.set(key, row.lang_name || null);
  }
  return map;
}

async function buildStockMap(products) {
  const codes = [
    ...new Set(products.map((item) => normalizeCode(item.prod_code)).filter(Boolean)),
  ];

  if (!codes.length) return new Map();

  const rows = await StockMaster.findAll({
    where: { prod_code: { [Op.in]: codes } },
    attributes: [
      "prod_code",
      [fn("SUM", col("qty")), "current_available_stock"],
    ],
    group: ["prod_code"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const key = normalizeCode(row.prod_code);
    if (!key) continue;
    map.set(key, Number(row.current_available_stock || 0));
  }

  return map;
}

async function enrichProducts(items) {
  const products = toPlainProducts(items);
  if (!products.length) return [];

  const [
    departmentMap,
    categoryMap,
    subCategoryMap,
    publisherMap,
    bookTypeMap,
    languageMap,
    authorNamesByProduct,
    stockMap,
  ] =
    await Promise.all([
    buildDepartmentMap(products),
    buildCategoryMap(products),
    buildSubCategoryMap(products),
    buildPublisherMap(products),
    buildBookTypeMap(products),
    buildLanguageMap(products),
    buildAuthorNamesByProductMap(products),
    buildStockMap(products),
    ]);

  return products.map((product) => {
    const normalizedDepartmentCode = normalizeCode(product.department);
    const normalizedCategoryCode = normalizeCode(product.category);
    const normalizedSubCategoryCode = normalizeCode(product.sub_category);
    const normalizedPublisherCode = normalizeCode(product.publisher);
    const normalizedBookTypeCode = normalizeCode(product.book_type);
    const normalizedLanguageCode = normalizeCode(product.language);
    const normalizedProdCode = normalizeCode(product.prod_code);
    const authorNames = normalizedProdCode
      ? authorNamesByProduct.get(normalizedProdCode) || []
      : [];
    const currentAvailableStock = normalizedProdCode
      ? Number(stockMap.get(normalizedProdCode) || 0)
      : 0;

    const { publisher, ...rest } = product;

    return {
      ...rest,
      department_name: normalizedDepartmentCode
        ? departmentMap.get(normalizedDepartmentCode) || null
        : null,
      category_name: normalizedCategoryCode
        ? categoryMap.get(normalizedCategoryCode) || null
        : null,
      sub_category_name: normalizedSubCategoryCode
        ? subCategoryMap.get(normalizedSubCategoryCode) || null
        : null,
      publisher_name: normalizedPublisherCode
        ? publisherMap.get(normalizedPublisherCode) || null
        : null,
      book_type_name: normalizedBookTypeCode
        ? bookTypeMap.get(normalizedBookTypeCode) || null
        : null,
      language_name: normalizedLanguageCode
        ? languageMap.get(normalizedLanguageCode) || null
        : null,
      current_available_stock: currentAvailableStock,
      isStock: currentAvailableStock > 0 ? 1 : 0,
      author_name: authorNames[0] || null,
      author_names: authorNames,
    };
  });
}

module.exports = { enrichProducts };
