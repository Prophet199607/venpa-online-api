const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Category = sequelize.define("categories", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  cat_code: { type: DataTypes.STRING(255), allowNull: false },
  cat_name: { type: DataTypes.STRING(255), allowNull: false },
  department: { type: DataTypes.STRING(255), allowNull: false },
  cat_image: { type: DataTypes.STRING(255), allowNull: true },
  status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
}, {
  timestamps: false
});

module.exports = Category;
