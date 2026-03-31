const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_DATABASE || process.env.MYSQL_DB,
  process.env.DB_USERNAME || process.env.MYSQL_USER,
  process.env.DB_PASSWORD || process.env.MYSQL_PASS,
  {
    host: process.env.DB_HOST || process.env.MYSQL_HOST,
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    dialect: "mysql",
    logging: false,
    define: {
      freezeTableName: true,
      underscored: true,
      engine: "InnoDB",
      charset: "utf8mb4",
      collate: "utf8mb4_general_ci",
    },
  },
);

module.exports = sequelize;
