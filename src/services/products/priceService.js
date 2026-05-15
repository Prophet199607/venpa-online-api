const { QueryTypes } = require("sequelize");
const sequelizeSource = require("../../config/sourceDb");

/**
 * Normalizes a code to uppercase and trimmed string.
 */
function normalizeCode(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toUpperCase();
  return v || null;
}

/**
 * Fetches the latest price levels for a list of products directly from the source database.
 *
 * @param {Array} products - Array of product objects or plain data.
 * @returns {Promise<Map>} - Map of prod_code -> PriceLevel object.
 */
async function buildPriceLevelMap(products) {
  const codes = [
    ...new Set(
      products.map((item) => normalizeCode(item.prod_code)).filter(Boolean),
    ),
  ];

  if (!codes.length) return new Map();

  console.log(
    `[PriceService] Fetching price levels for codes: ${JSON.stringify(codes)}`,
  );


  try {
    // Query the source database directly
    const rows = await sequelizeSource.query(
      `SELECT prod_code, selling_price, purchase_price 
       FROM price_levels 
       WHERE prod_code IN (:codes) 
       ORDER BY id DESC`,

      {
        replacements: { codes },
        type: QueryTypes.SELECT,
      },
    );

    console.log(
      `[PriceService] Found ${rows.length} rows in price_levels table.`,
    );
    if (rows.length > 0) {
      console.log(`[PriceService] Sample row:`, JSON.stringify(rows[0]));
    }


    const map = new Map();
    for (const row of rows) {
      const key = normalizeCode(row.prod_code);
      if (key && !map.has(key)) {
        map.set(key, row);
      }
    }
    return map;
  } catch (error) {
    console.error(
      "[PriceService] ERROR fetching price levels from source DB:",
      error.message,
    );
    if (error.original) {
      console.error("[PriceService] Original Error:", error.original.message);
    }
    return new Map();
  }
}

/**
 * Overrides product prices with the latest price levels if available.
 *
 * @param {Array} products - Array of product objects (plain JSON).
 * @returns {Promise<Array>} - Enriched products.
 */
async function applyLatestPrices(products) {
  if (!products || !products.length) return products;

  const priceLevelMap = await buildPriceLevelMap(products);

  return products.map((product) => {
    const prodCode = normalizeCode(product.prod_code);
    const pl = priceLevelMap.get(prodCode);

    if (pl) {
      return {
        ...product,
        selling_price: pl.selling_price || product.selling_price,
      };
    }
    return product;
  });
}

module.exports = {
  buildPriceLevelMap,
  applyLatestPrices,
  normalizeCode,
};
