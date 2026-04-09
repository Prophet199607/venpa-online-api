const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Author = sequelize.define(
  "authors",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    auth_code: { type: DataTypes.STRING(255), allowNull: false },
    auth_name: { type: DataTypes.STRING(255), allowNull: false },
    auth_name_other_language: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    auth_image: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
  },
  { timestamps: false }
);

module.exports = Author;
