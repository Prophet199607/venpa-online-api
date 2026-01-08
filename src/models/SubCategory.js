const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SubCategory = sequelize.define("sub_categories", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  scat_code: { type: DataTypes.STRING(255), allowNull: false },
  scat_name: { type: DataTypes.STRING(255), allowNull: false },
  department: { type: DataTypes.STRING(255), allowNull: false },
  cat_code: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  created_by: { type: DataTypes.BIGINT, allowNull: true },
  updated_by: { type: DataTypes.BIGINT, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: true },
  updated_at: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: false
});

module.exports = SubCategory;
