const cron = require("node-cron");
const { Op } = require("sequelize");
const { ProductDiscount } = require("../../models");

function startDiscountJobs() {
  const schedule = process.env.DISCOUNT_EXPIRY_CRON || "0 0 * * *";

  cron.schedule(schedule, async () => {
    console.log(`[DiscountExpiry] Job triggered at ${new Date().toISOString()}`);
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const todayStr = `${year}/${month}/${day}`;

      const [updated] = await ProductDiscount.update(
        { status: 0 },
        {
          where: {
            status: 1,
            end_date: { [Op.lt]: todayStr },
          },
        },
      );

      console.log(`[DiscountExpiry] Expired ${updated} discount(s) (end_date < ${todayStr})`);
    } catch (e) {
      console.error("[DiscountExpiry] Job failed:", e.message);
    }
  });

  // Run once on startup in development mode
  if (process.env.NODE_ENV === "development") {
    console.log("[DiscountExpiry] Development mode detected: running initial check...");
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const todayStr = `${year}/${month}/${day}`;

    ProductDiscount.update(
      { status: 0 },
      { where: { status: 1, end_date: { [Op.lt]: todayStr } } },
    ).then(([updated]) => {
      console.log(`[DiscountExpiry] Initial run: expired ${updated} discount(s)`);
    }).catch((e) => {
      console.error("[DiscountExpiry] Initial run failed:", e.message);
    });
  }

  console.log(`[DiscountExpiry] Scheduled with cron: "${schedule}"`);
}

module.exports = { startDiscountJobs };
