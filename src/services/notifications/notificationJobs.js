const cron = require("node-cron");
const { Op } = require("sequelize");
const { runCartExpiryNotifications } = require("./cartExpiryNotifier");
const { NotificationLog } = require("../../models");

function startNotificationJobs() {
  // ── 1. Cart expiry notifications ──────────────────────────────────────────
  //   Default: run at 09:00 every day.
  //   Override via CART_NOTIFY_CRON env var (standard cron syntax).
  //
  //   Cart expiry lifecycle (30-day window from item creation):
  //     Day 23  → "1 week left"  push notification
  //     Day 30  → "24 hours left" push notification
  //     Day 30+ → item is deleted from cart
  const cartSchedule = process.env.CART_NOTIFY_CRON || "0 9 * * *";

  cron.schedule(cartSchedule, async () => {
    console.log(`[CartExpiry] Job triggered at ${new Date().toISOString()}`);
    try {
      await runCartExpiryNotifications();
      console.log("[CartExpiry] Job completed successfully.");
    } catch (e) {
      console.error("[CartExpiry] Job failed:", e.message);
    }
  });

  // Run once on startup in development mode to help with testing
  if (process.env.NODE_ENV === "development") {
    console.log(
      "[CartExpiry] Development mode detected: running initial check...",
    );
    runCartExpiryNotifications().catch((e) =>
      console.error("[CartExpiry] Initial run failed:", e.message),
    );
  }

  console.log(`[CartExpiry] Scheduled with cron: "${cartSchedule}"`);

  // ── 2. Notification log cleanup ───────────────────────────────────────────
  //   Runs daily at 02:00 AM.
  //   Deletes notification_logs records older than 30 days.
  //   Override via NOTIF_CLEANUP_CRON env var.
  const cleanupSchedule = process.env.NOTIF_CLEANUP_CRON || "0 2 * * *";

  cron.schedule(cleanupSchedule, async () => {
    console.log(`[NotifCleanup] Job triggered at ${new Date().toISOString()}`);
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const deleted = await NotificationLog.destroy({
        where: { created_at: { [Op.lt]: cutoff } },
      });
      console.log(`[NotifCleanup] Removed ${deleted} old notification log(s).`);
    } catch (e) {
      console.error("[NotifCleanup] Job failed:", e.message);
    }
  });

  console.log(`[NotifCleanup] Scheduled with cron: "${cleanupSchedule}"`);
}

module.exports = { startNotificationJobs };
