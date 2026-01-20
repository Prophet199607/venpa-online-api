const { QueryTypes } = require("sequelize");
const sequelizeSource = require("../../config/sourceDb");

const ENTITY_UPDATED_COLUMN = {
  departments: "updated_at",
  categories: "updated_at",
  sub_categories: "updated_at",
  products: "updated_at",
  product_images: "updated_at"
};

async function fetchEntities(entity, updatedAfter) {
  const table = entity;
  const updatedColumn = ENTITY_UPDATED_COLUMN[entity];

  if (updatedAfter && updatedColumn) {
    try {
      return await sequelizeSource.query(
        `SELECT * FROM \`${table}\` WHERE \`${updatedColumn}\` >= :updatedAfter`,
        {
          replacements: { updatedAfter },
          type: QueryTypes.SELECT
        }
      );
    } catch (err) {
      // Fallback to full fetch if updated_at is not present.
    }
  }

  return await sequelizeSource.query(
    `SELECT * FROM \`${table}\``,
    { type: QueryTypes.SELECT }
  );
}

module.exports = { fetchEntities };
