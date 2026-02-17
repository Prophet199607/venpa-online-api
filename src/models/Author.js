const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Author = sequelize.define(
  "authors",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    auth_code: { type: DataTypes.STRING(255), allowNull: true },
    auth_name: { type: DataTypes.STRING(255), allowNull: true },
  },
  { timestamps: false }
);

module.exports = Author;
