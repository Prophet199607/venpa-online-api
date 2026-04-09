const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const AppVersion = sequelize.define(
  "app_versions",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    platform: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    latest_version: { type: DataTypes.STRING(50), allowNull: false },
    force_update: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false }
);

module.exports = AppVersion;
