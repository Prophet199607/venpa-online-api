const cron = require("node-cron");
require("dotenv").config();
const { syncAll } = require("./syncService");

function startSyncJobs() {
  const schedule = process.env.SYNC_CRON || "*/5 * * * *";

  cron.schedule(schedule, async () => {
    try {
      const results = await syncAll();
      const summary = results
        .map((r) => `${r.entity}:${r.fetched} (c:${r.created}, u:${r.updated}, f:${r.failed})`)
        .join(" | ");
      console.log("Sync done:", summary);
      const errors = results.flatMap((r) => r.errors || []);
      if (errors.length) {
        console.error(`Sync errors (${errors.length})`, errors.slice(0, 10));
      }
    } catch (e) {
      console.error("Sync failed:", e.message);
    }
  });
}

module.exports = { startSyncJobs };
