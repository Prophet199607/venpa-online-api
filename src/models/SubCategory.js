const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SubCategory = sequelize.define("sub_categories", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  scat_code: { type: DataTypes.STRING(255), allowNull: false },
  scat_name: { type: DataTypes.STRING(255), allowNull: false },
  department: { type: DataTypes.STRING(255), allowNull: false },
  cat_code: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
}, {
  timestamps: false
});

module.exports = SubCategory;
