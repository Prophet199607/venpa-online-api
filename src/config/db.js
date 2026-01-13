const{ Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.MYSQL_DB,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASS,
  {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    dialect: "mysql",
    logging: false,
    define: {
      freezeTableName: true,   // use table name exactly as in DB
      underscored: true        // maps created_at, updated_at
    }
  }
);

module.exports = sequelize;