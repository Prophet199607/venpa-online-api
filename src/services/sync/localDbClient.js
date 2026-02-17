const { QueryTypes } = require("sequelize");
const sequelizeSource = require("../../config/sourceDb");

const ENTITY_UPDATED_COLUMN = {
  departments: "updated_at",
  categories: "updated_at",
  sub_categories: "updated_at",
  publishers: "updated_at",
  book_types: "updated_at",
  authors: "updated_at",
  products: "updated_at",
  product_authors: "updated_at",
  product_images: "updated_at"
};

function tableCandidates(entity) {
  if (entity === "book_types") {
    const candidates = [
      process.env.SYNC_BOOK_TYPES_TABLE,
      process.env.BOOK_TYPES_TABLE,
      "book_types",
      "boot_types",
    ].filter(Boolean);
    return [...new Set(candidates)];
  }
  return [entity];
}

async function queryTable(table, updatedColumn, updatedAfter) {
  if (updatedAfter && updatedColumn) {
    try {
      return await sequelizeSource.query(
        `SELECT * FROM \`${table}\` WHERE \`${updatedColumn}\` >= :updatedAfter`,
        {
          replacements: { updatedAfter },
          type: QueryTypes.SELECT,
        }
      );
    } catch (err) {
      // Fallback to full fetch for this table name.
    }
  }

  return await sequelizeSource.query(`SELECT * FROM \`${table}\``, {
    type: QueryTypes.SELECT,
  });
}

async function fetchEntities(entity, updatedAfter) {
  const updatedColumn = ENTITY_UPDATED_COLUMN[entity];
  const candidates = tableCandidates(entity);
  let lastError = null;

  for (const table of candidates) {
    try {
      return await queryTable(table, updatedColumn, updatedAfter);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Failed to fetch sync entity: ${entity}`);
}

module.exports = { fetchEntities };
