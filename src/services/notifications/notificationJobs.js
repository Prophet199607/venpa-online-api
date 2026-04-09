const cron = require("node-cron");
const { runCartExpiryNotifications } = require("./cartExpiryNotifier");

function startNotificationJobs() {
  const schedule = process.env.CART_NOTIFY_CRON || "0 9 * * *";

  cron.schedule(schedule, async () => {
    try {
      await runCartExpiryNotifications();
      console.log("Cart expiry notifications sent");
    } catch (e) {
      console.error("Cart expiry notification job failed:", e.message);
    }
  });
}

module.exports = { startNotificationJobs };
