const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const { sequelize } = require("./src/models");

(async () => {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Connected!");

    console.log("⚠️  Dropping all tables...");
    await sequelize.drop();
    console.log("✅ All tables dropped!");

    console.log("🔨 Creating tables with correct schema...");
    await sequelize.sync({ force: true });
    console.log("✅ All tables created successfully!");

    console.log("\n📋 Created tables:");
    const [results] = await sequelize.query("SHOW TABLES");
    results.forEach((row) => {
      console.log(`  - ${Object.values(row)[0]}`);
    });

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
})();
