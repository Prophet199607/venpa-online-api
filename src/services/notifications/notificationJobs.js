const cron = require("node-cron");
const { runCartExpiryNotifications } = require("./cartExpiryNotifier");

function startNotificationJobs() {
  // Default: run at 09:00 every day.
  // Override via CART_NOTIFY_CRON env var (standard cron syntax).
  //
  // Cart expiry lifecycle (30-day window from item creation):
  //   Day 23  → "1 week left"  push notification
  //   Day 30  → "24 hours left" push notification
  //   Day 30+ → item is deleted from cart
  const schedule = process.env.CART_NOTIFY_CRON;

  cron.schedule(schedule, async () => {
    console.log(`[CartExpiry] Job triggered at ${new Date().toISOString()}`);
    try {
      await runCartExpiryNotifications();
      console.log("[CartExpiry] Job completed successfully.");
    } catch (e) {
      console.error("[CartExpiry] Job failed:", e.message);
    }
  });

  console.log(`[CartExpiry] Scheduled with cron: "${schedule}"`);
}

module.exports = { startNotificationJobs };
