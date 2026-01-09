const cron = require("node-cron");
require("dotenv").config();
const { syncAll } = require("./syncService");

function startSyncJobs() {
  const schedule = process.env.SYNC_CRON || "*/5 * * * *";

  cron.schedule(schedule, async () => {
    try {
      const results = await syncAll();
      console.log("🔁 Sync done:", results.map(r => `${r.entity}:${r.fetched}`).join(" | "));
    } catch (e) {
      console.error("❌ Sync failed:", e.message);
    }
  });
}

module.exports = { startSyncJobs };
