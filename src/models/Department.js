const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Department = sequelize.define("departments", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  dep_code: { type: DataTypes.STRING(255), allowNull: false },
  dep_name: { type: DataTypes.STRING(255), allowNull: false },
  dep_image: { type: DataTypes.STRING(255), allowNull: true },
  status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
}, {
  timestamps: false
});

module.exports = Department;
