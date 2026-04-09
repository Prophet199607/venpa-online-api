const { Sequelize } = require("sequelize");

const sequelizeSource = new Sequelize(
  process.env.MYSQL_SOURCE_DB,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASS,
  {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    dialect: "mysql",
    logging: false,
    define: {
      freezeTableName: true,
      underscored: true,
    },
  }
);

module.exports = sequelizeSource;
