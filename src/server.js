const path = require("path");
const fs = require("fs");

const baseEnvFile = path.resolve(process.cwd(), ".env");
const productionEnvFile = path.resolve(process.cwd(), ".env.production");

if (fs.existsSync(baseEnvFile)) {
  require("dotenv").config({ path: baseEnvFile });
}

if (
  String(process.env.NODE_ENV || "").trim() === "production" &&
  fs.existsSync(productionEnvFile)
) {
  require("dotenv").config({ path: productionEnvFile, override: true });
}

const app = require("./app");
const { sequelize, ...models } = require("./models");
const { startSyncJobs } = require("./services/sync/syncJobs");
const {
  startNotificationJobs,
} = require("./services/notifications/notificationJobs");

const PORT = Number(process.env.PORT || 4000);

const syncMode = String(process.env.DB_SYNC_MODE || "none")
  .trim()
  .toLowerCase();

/**
 * Safely sync a single model. Errors are caught per-model so one
 * failure never blocks the rest.
 */
async function safeSyncModel(Model) {
  const name = Model.tableName || Model.name;
  try {
    if (syncMode === "alter") {
      await Model.sync({ alter: true });
    } else if (syncMode === "force") {
      await Model.sync({ force: true });
    }
  } catch (err) {
    console.error(`❌ Could not sync table "${name}": ${err.message}`);
  }
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log("MySQL connect wuna!");

    if (syncMode !== "none") {
      console.log(`Syncing tables individually (DB_SYNC_MODE: ${syncMode})...`);
      const modelList = Object.values(models).filter(
        (m) => m && typeof m.sync === "function",
      );
      for (const Model of modelList) {
        await safeSyncModel(Model);
      }
      console.log("✅ All tables synced!");
    } else {
      console.log("Skipping Sequelize sync on startup (DB_SYNC_MODE=none)");
    }

    if (process.env.SYNC_ENABLED === "true") {
      startSyncJobs();
      console.log("Sync jobs tika start wuna!");
    }

    if (process.env.NOTIFY_ENABLED === "true") {
      startNotificationJobs();
      console.log("Notification jobs started!");
    }

    app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
  } catch (err) {
    console.error("❌ Startup error ekak :(", err);
    process.exit(1);
  }
})();
