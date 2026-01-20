const { Department, Category, SubCategory, Product, ProductImage, SyncState } = require("../../models");
const { fetchEntities: fetchFromApi } = require("./otherApiClient");
const { fetchEntities: fetchFromDb } = require("./localDbClient");

const ENTITY_CONFIG = {
  departments: { model: Department, key: "dep_code" },
  categories: { model: Category, key: "cat_code" },
  sub_categories: { model: SubCategory, key: "scat_code" },
  products: { model: Product, key: "prod_code" },
  product_images: { model: ProductImage, key: ["prod_code", "image"] }
};

function getFetcher() {
  return process.env.SYNC_SOURCE === "db" ? fetchFromDb : fetchFromApi;
}

async function getLastSyncedAt(entity) {
  const row = await SyncState.findOne({ where: { entity } });
  return row?.last_synced_at || null;
}

async function setLastSyncedAt(entity, date) {
  const [row] = await SyncState.findOrCreate({ where: { entity }, defaults: { last_synced_at: date } });
  await row.update({ last_synced_at: date });
}

function hasKeyValue(keyField, item) {
  if (Array.isArray(keyField)) {
    return keyField.every((key) => item[key]);
  }
  return Boolean(item[keyField]);
}

async function upsertByKey(model, keyField, item) {
  // Find existing by code, otherwise create
  const where = Array.isArray(keyField)
    ? keyField.reduce((acc, key) => {
        acc[key] = item[key];
        return acc;
      }, {})
    : { [keyField]: item[keyField] };
  const existing = await model.findOne({ where });

  if (existing) {
    await existing.update(item);
    return { action: "updated" };
  } else {
    await model.create(item);
    return { action: "created" };
  }
}

async function syncEntity(entity, options = {}) {
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) throw new Error(`Unknown entity: ${entity}`);

  const last = options.full ? null : await getLastSyncedAt(entity);
  const fetchEntities = getFetcher();
  const items = await fetchEntities(entity, last);

  let created = 0, updated = 0, failed = 0;
  const errors = [];

  for (const item of items) {
    if (!hasKeyValue(cfg.key, item)) continue; // skip invalid rows
    try {
      const r = await upsertByKey(cfg.model, cfg.key, item);
      if (r.action === "created") created++;
      else updated++;
    } catch (err) {
      failed++;
      errors.push({ key: item[cfg.key], message: err.message });
    }
  }

  await setLastSyncedAt(entity, new Date());

  return {
    entity,
    fetched: items.length,
    created,
    updated,
    failed,
    errors,
    lastSyncedAt: new Date()
  };
}

async function syncAll(options = {}) {
  // Important order: parents first, products last
  const results = [];
  results.push(await syncEntity("departments", options));
  results.push(await syncEntity("categories", options));
  results.push(await syncEntity("sub_categories", options));
  results.push(await syncEntity("products", options));
  results.push(await syncEntity("product_images", options));
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
