const { StockMaster, sequelize } = require("../../models");
const { Op } = require("sequelize");

/**
 * Checks if stock is available for a list of items across all locations.
 *
 * @param {Array} items - Array of { prod_code, quantity }
 * @returns {Promise<{available: boolean, missingItems: Array}>}
 */
async function checkStockAvailability(items) {
  const missingItems = [];

  for (const item of items) {
    const prodCode = item.prod_code || item.product?.prod_code;
    const quantity = parseFloat(item.quantity || 0);

    if (!prodCode || quantity <= 0) continue;

    const stock = await StockMaster.findOne({
      where: {
        prod_code: prodCode,
      },
      attributes: [
        [sequelize.fn("SUM", sequelize.col("qty")), "available_qty"],
      ],
      raw: true,
    });

    const availableQty = parseFloat(stock?.available_qty || 0);
    if (availableQty < quantity) {
      missingItems.push({
        prod_code: prodCode,
        requested: quantity,
        available: availableQty,
      });
    }
  }

  return {
    available: missingItems.length === 0,
    missingItems,
  };
}

/**
 * Deducts stock from the source database (venpaa_new) by inserting a negative adjustment record.
 *
 * @param {string} prodCode
 * @param {string} location
 * @param {number} quantity
 * @param {string} iid - identification for the source (Web/Mobile)
 */
async function deductStock(prodCode, location, quantity, iid = null) {
  const amountToDeduct = parseFloat(quantity);
  if (isNaN(amountToDeduct) || amountToDeduct <= 0) return;

  const normalizedProdCode = String(prodCode || "").trim();
  const normalizedLocation = String(location || "").trim();

  if (!normalizedProdCode || !normalizedLocation) {
    console.warn(
      `[DeductStock] Invalid params: prodCode=${prodCode}, location=${location}`,
    );
    return;
  }

  // Retrieve the latest stock record for this product to carry over pricing
  const referenceStock = await StockMaster.findOne({
    where: { prod_code: normalizedProdCode },
    order: [["id", "DESC"]],
  });

  const pPrice = referenceStock
    ? parseFloat(referenceStock.purchase_price || 0)
    : 0;
  const sPrice = referenceStock
    ? parseFloat(referenceStock.selling_price || 0)
    : 0;

  const qtyToStore = -amountToDeduct;
  const amountToStore = Math.abs(sPrice * amountToDeduct);

  const now = new Date();

  // Format transactionDate as "YYYY-MM-DD" (Current date only)
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const transactionDate = `${year}-${month}-${day}`;

  // Use a common doc_no to identify where the order came from
  const sourceIndicator = iid === "WEB" ? "WEB" : "APP";
  const docNo = `${sourceIndicator}_ORDER`;

  // Create a new record with negative quantity (deduction)
  await StockMaster.create({
    location: normalizedLocation,
    prod_code: normalizedProdCode,
    transaction_date: transactionDate,
    doc_no: docNo,
    iid: sourceIndicator,
    qty: qtyToStore,
    purchase_price: pPrice,
    selling_price: sPrice,
    amount: amountToStore,
    created_at: now,
    updated_at: now,
  });

  console.log(
    `[DeductStock] Inserted deduction record for ${normalizedProdCode} at ${normalizedLocation}: ${qtyToStore} (Doc: ${docNo})`,
  );
}

module.exports = { deductStock, checkStockAvailability };
