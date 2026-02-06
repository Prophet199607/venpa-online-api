const path = require("path");
const envFile =
  process.env.NODE_ENV === "production" ? ".env.production" : ".env";
require("dotenv").config({ path: path.resolve(process.cwd(), envFile) });

const app = require("./app");
const { sequelize } = require("./models");
const { startSyncJobs } = require("./services/sync/syncJobs");
const { startNotificationJobs } = require("./services/notifications/notificationJobs");

const PORT = Number(process.env.PORT || 4000);

(async () => {
  try {
    console.log("MYSQL_USER:", process.env.MYSQL_USER);

    await sequelize.authenticate();
    console.log("MySQL connect wuna!");

    console.log("Syncing Tables...");
    console.log("Registered Models:", Object.keys(sequelize.models));

    const syncOptions =
      process.env.NODE_ENV === "development" ? { alter: true } : {};

    await sequelize.sync(syncOptions);
    console.log(`Database synchronized! (Mode: ${process.env.NODE_ENV})`);

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
