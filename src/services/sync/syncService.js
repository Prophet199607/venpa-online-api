const { Department, Category, SubCategory, Product, SyncState } = require("../../models");
const { fetchEntities } = require("./otherApiClient");

const ENTITY_CONFIG = {
  departments: { model: Department, key: "dep_code" },
  categories: { model: Category, key: "cat_code" },
  sub_categories: { model: SubCategory, key: "scat_code" },
  products: { model: Product, key: "prod_code" }
};

async function getLastSyncedAt(entity) {
  const row = await SyncState.findOne({ where: { entity } });
  return row?.last_synced_at || null;
}

async function setLastSyncedAt(entity, date) {
  const [row] = await SyncState.findOrCreate({ where: { entity }, defaults: { last_synced_at: date } });
  await row.update({ last_synced_at: date });
}

async function upsertByKey(model, keyField, item) {
  // Find existing by code, otherwise create
  const where = { [keyField]: item[keyField] };
  const existing = await model.findOne({ where });

  if (existing) {
    await existing.update(item);
    return { action: "updated" };
  } else {
    await model.create(item);
    return { action: "created" };
  }
}

async function syncEntity(entity) {
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) throw new Error(`Unknown entity: ${entity}`);

  const last = await getLastSyncedAt(entity);
  const items = await fetchEntities(entity, last);

  let created = 0, updated = 0;

  for (const item of items) {
    if (!item[cfg.key]) continue; // skip invalid rows
    const r = await upsertByKey(cfg.model, cfg.key, item);
    if (r.action === "created") created++;
    else updated++;
  }

  await setLastSyncedAt(entity, new Date());

  return { entity, fetched: items.length, created, updated, lastSyncedAt: new Date() };
}

async function syncAll() {
  // Important order: parents first, products last
  const results = [];
  results.push(await syncEntity("departments"));
  results.push(await syncEntity("categories"));
  results.push(await syncEntity("sub_categories"));
  results.push(await syncEntity("products"));
  return results;
}

module.exports = { syncEntity, syncAll };
