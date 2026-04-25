const { Sequelize } = require("sequelize");

const sequelizeSource = new Sequelize(
  process.env.MYSQL_SOURCE_DB,
  process.env.MYSQL_USER || process.env.DB_USERNAME,
  process.env.MYSQL_PASS || process.env.DB_PASSWORD,
  {
    host: process.env.MYSQL_HOST || process.env.DB_HOST,
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    dialect: "mysql",
    logging: false,
    define: {
      freezeTableName: true,
      underscored: true,
    },
  },
);

module.exports = sequelizeSource;
