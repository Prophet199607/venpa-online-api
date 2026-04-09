const {
  Department,
  Category,
  SubCategory,
  Product,
  Publisher,
  BookType,
  Author,
  Language,
  Location,
  ProductAuthor,
  ProductSubCategory,
  ProductImage,
  StockMaster,
  CodValueCharge,
  CourierWeightCharge,
  SyncState,
} = require("../../models");
const { Op } = require("sequelize");
const { fetchEntities: fetchFromApi } = require("./otherApiClient");
const { fetchEntities: fetchFromDb } = require("./localDbClient");

const ENTITY_CONFIG = {
  departments: { model: Department, key: "dep_code", pruneMissing: true },
  categories: { model: Category, key: "cat_code", pruneMissing: true },
  sub_categories: { model: SubCategory, key: "scat_code", pruneMissing: true },
  publishers: { model: Publisher, key: "pub_code", pruneMissing: true },
  book_types: { model: BookType, key: "book_type", pruneMissing: true },
  authors: { model: Author, key: "auth_code", pruneMissing: true },
  languages: { model: Language, key: "lang_code", pruneMissing: true },
  locations: { model: Location, key: "loca_code", pruneMissing: true },
  cod_value_charges: { model: CodValueCharge, key: "id", pruneMissing: true },
  courier_weight_charges: {
    model: CourierWeightCharge,
    key: "id",
    pruneMissing: true,
  },
  products: { model: Product, key: "prod_code" },
  product_authors: { model: ProductAuthor, key: "id" },
  product_sub_categories: { model: ProductSubCategory, key: "id" },
  product_images: { model: ProductImage, key: ["prod_code", "image"] },
  stock_masters: { model: StockMaster, key: "id" },
};

function getFetcher() {
  return process.env.SYNC_SOURCE === "db" ? fetchFromDb : fetchFromApi;
}

async function getLastSyncedAt(entity) {
  const row = await SyncState.findOne({ where: { entity } });
  return row?.last_synced_at || null;
}

async function setLastSyncedAt(entity, date) {
  const [row] = await SyncState.findOrCreate({
    where: { entity },
    defaults: { last_synced_at: date },
  });
  await row.update({ last_synced_at: date });
}

function hasKeyValue(keyField, item) {
  if (Array.isArray(keyField)) {
    return keyField.every((key) => item[key]);
  }
  return Boolean(item[keyField]);
}

function normalizeSyncValue(attr, value) {
  if (value === undefined) return value;
  if (value === null) return null;

  const typeKey = attr?.type?.key;
  if (!typeKey) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (typeKey === "DATE") {
      if (
        !trimmed ||
        trimmed === "0000-00-00" ||
        trimmed === "0000-00-00 00:00:00" ||
        trimmed.toLowerCase() === "invalid date"
      ) {
        return null;
      }
      return trimmed;
    }

    if (
      ["INTEGER", "BIGINT", "FLOAT", "DOUBLE", "REAL", "DECIMAL"].includes(
        typeKey,
      )
    ) {
      if (!trimmed) {
        if (attr.allowNull !== false) return null;
        if (attr.defaultValue !== undefined) return attr.defaultValue;
        return 0;
      }
      return trimmed;
    }
  }

  return value;
}

function sanitizeSyncItem(model, item) {
  const attrs = model?.rawAttributes || {};
  const payload = { ...item };

  for (const [key, value] of Object.entries(payload)) {
    if (!attrs[key]) continue;
    payload[key] = normalizeSyncValue(attrs[key], value);
  }

  return payload;
}

function formatSyncError(err) {
  if (Array.isArray(err?.errors) && err.errors.length) {
    return err.errors
      .map((item) => `${item.path || "field"}: ${item.message}`)
      .join("; ");
  }
  return err?.message || "Unknown sync error";
}

async function upsertByKey(model, keyField, item) {
  const payload = sanitizeSyncItem(model, item);

  // Find existing by code, otherwise create
  const where = Array.isArray(keyField)
    ? keyField.reduce((acc, key) => {
        acc[key] = payload[key];
        return acc;
      }, {})
    : { [keyField]: payload[keyField] };
  const existing = await model.findOne({ where });

  if (existing) {
    await existing.update(payload, { validate: false });
    return { action: "updated" };
  } else {
    await model.create(payload, { validate: false });
    return { action: "created" };
  }
}

function serializeKey(keyField, item) {
  if (Array.isArray(keyField)) {
    return keyField.map((key) => String(item[key])).join("::");
  }
  return String(item[keyField]);
}

async function pruneMissingRecords(model, keyField, items) {
  const validItems = items.filter((item) => hasKeyValue(keyField, item));
  if (!validItems.length) {
    // Avoid wiping local tables if the upstream source temporarily returns no rows.
    return 0;
  }

  if (!Array.isArray(keyField)) {
    const sourceValues = [...new Set(validItems.map((item) => item[keyField]))];
    return model.destroy({
      where: {
        [keyField]: {
          [Op.notIn]: sourceValues,
        },
      },
    });
  }

  const localRows = await model.findAll({
    attributes: keyField,
    raw: true,
  });

  const sourceKeys = new Set(
    validItems.map((item) => serializeKey(keyField, item)),
  );
  const missingWheres = localRows
    .filter((row) => !sourceKeys.has(serializeKey(keyField, row)))
    .map((row) =>
      keyField.reduce((acc, key) => {
        acc[key] = row[key];
        return acc;
      }, {}),
    );

  if (!missingWheres.length) return 0;

  return model.destroy({
    where: {
      [Op.or]: missingWheres,
    },
  });
}

async function syncEntity(entity, options = {}) {
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) throw new Error(`Unknown entity: ${entity}`);

  const useFullSync = Boolean(options.full || cfg.pruneMissing);
  const last = useFullSync ? null : await getLastSyncedAt(entity);
  const fetchEntities = getFetcher();
  const items = await fetchEntities(entity, last);

  let created = 0,
    updated = 0,
    failed = 0,
    deleted = 0;
  const errors = [];

  for (const item of items) {
    if (!hasKeyValue(cfg.key, item)) continue; // skip invalid rows
    try {
      const r = await upsertByKey(cfg.model, cfg.key, item);
      if (r.action === "created") created++;
      else updated++;
    } catch (err) {
      failed++;
      errors.push({ key: item[cfg.key], message: formatSyncError(err) });
    }
  }

  if (cfg.pruneMissing) {
    try {
      deleted = await pruneMissingRecords(cfg.model, cfg.key, items);
    } catch (err) {
      failed++;
      errors.push({ key: "__delete__", message: formatSyncError(err) });
    }
  }

  const syncFinishedAt = new Date();
  if (failed === 0) {
    await setLastSyncedAt(entity, syncFinishedAt);
  }

  return {
    entity,
    fetched: items.length,
    created,
    updated,
    deleted,
    failed,
    errors,
    lastSyncedAt: syncFinishedAt,
  };
}

async function syncAll(options = {}) {
  // Important order: parents first, products last
  const results = [];
  results.push(await syncEntity("departments", options));
  results.push(await syncEntity("categories", options));
  results.push(await syncEntity("sub_categories", options));
  results.push(await syncEntity("publishers", options));
  results.push(await syncEntity("book_types", options));
  results.push(await syncEntity("authors", options));
  results.push(await syncEntity("languages", options));
  results.push(await syncEntity("locations", options));
  results.push(await syncEntity("products", options));
  results.push(await syncEntity("product_authors", options));
  results.push(await syncEntity("product_sub_categories", options));
  results.push(await syncEntity("product_images", options));
  results.push(await syncEntity("stock_masters", options));
  results.push(await syncEntity("cod_value_charges", options));
  results.push(await syncEntity("courier_weight_charges", options));
  return results;
}

async function getSyncStatus() {
  const rows = await SyncState.findAll();
  const map = rows.reduce((acc, row) => {
    acc[row.entity] = row.last_synced_at;
    return acc;
  }, {});

  const counts = {};
  for (const key of Object.keys(ENTITY_CONFIG)) {
    counts[key] = await ENTITY_CONFIG[key].model.count();
  }

  return { lastSyncedAt: map, counts };
}

module.exports = { syncEntity, syncAll, getSyncStatus };
