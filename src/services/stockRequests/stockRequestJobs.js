const cron = require("node-cron");
const { Op } = require("sequelize");
const { StockRequest, StockMaster } = require("../../models");
const {
  sendBackInStockEmail,
} = require("../notifications/emailService");

function toDateMs(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

/**
 * Returns true when at least one GRN stock-in row for the product happened on
 * or after the given request date (created_at, falling back to
 * transaction_date).
 */
function hasGrnSince(grnRows, requestMs) {
  if (!requestMs) return false;
  return grnRows.some((row) => {
    const createdMs = toDateMs(row.created_at);
    if (createdMs !== null && createdMs !== undefined) return createdMs >= requestMs;
    const txnMs = toDateMs(row.transaction_date);
    return txnMs !== null && txnMs !== undefined && txnMs >= requestMs;
  });
}

/**
 * Checks pending stock requests (status = 0) against MYSQL_SOURCE_DB
 * stock_masters. When a product receives a GRN stock-in (location = '001' and
 * iid = 'GRN') after the request was made, an email is sent to the requesting
 * user from sales@venpaa.lk. Only after a successful send is the request
 * marked as notified (status = 1).
 */
async function checkAndNotifyBackInStock() {
  const pending = await StockRequest.findAll({
    where: { status: 0 },
    attributes: ["id", "name", "email", "prod_code", "prod_name", "created_at"],
    raw: true,
  });

  if (!pending.length) {
    console.log("[StockRequest] No pending stock requests to process.");
    return { processed: 0, sent: 0 };
  }

  const pendingCodes = [...new Set(pending.map((r) => r.prod_code))];

  const grnRows = await StockMaster.findAll({
    where: {
      location: "001",
      iid: "GRN",
      qty: { [Op.gt]: 0 },
      prod_code: { [Op.in]: pendingCodes },
    },
    attributes: ["prod_code", "created_at", "transaction_date"],
    raw: true,
  });

  const grnByCode = new Map();
  for (const row of grnRows) {
    if (!grnByCode.has(row.prod_code)) grnByCode.set(row.prod_code, []);
    grnByCode.get(row.prod_code).push(row);
  }

  let sent = 0;
  for (const req of pending) {
    const rows = grnByCode.get(req.prod_code) || [];
    const requestMs = toDateMs(req.created_at);

    if (!hasGrnSince(rows, requestMs)) continue;

    try {
      await sendBackInStockEmail({
        name: req.name,
        email: req.email,
        prod_code: req.prod_code,
        prod_name: req.prod_name,
      });

      const now = new Date();
      await StockRequest.update(
        { status: 1, notified_at: now, updated_at: now },
        { where: { id: req.id } },
      );
      sent += 1;
    } catch (e) {
      console.error(
        `[StockRequest] Back in stock email to ${req.email} (req #${req.id}) failed, keeping request pending:`,
        e.message,
      );
    }
  }

  return { processed: pending.length, sent };
}

function startStockRequestJobs() {
  const schedule = process.env.STOCK_REQUEST_CHECK_CRON || "*/5 * * * *";

  cron.schedule(schedule, async () => {
    console.log(`[StockRequest] Job triggered at ${new Date().toISOString()}`);
    try {
      const result = await checkAndNotifyBackInStock();
      console.log(
        `[StockRequest] Done: ${result.processed} pending, ${result.sent} notified.`,
      );
    } catch (e) {
      console.error("[StockRequest] Job failed:", e.message);
    }
  });

  // Run once on startup in development mode to help with testing
  if (process.env.NODE_ENV === "development") {
    console.log(
      "[StockRequest] Development mode detected: running initial check...",
    );
    checkAndNotifyBackInStock().catch((e) =>
      console.error("[StockRequest] Initial run failed:", e.message),
    );
  }

  console.log(`[StockRequest] Scheduled with cron: "${schedule}"`);
}

module.exports = { startStockRequestJobs, checkAndNotifyBackInStock };