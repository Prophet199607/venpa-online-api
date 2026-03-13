const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CustomDisplayLink = sequelize.define(
  "custom_display_links",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    item_type: { type: DataTypes.STRING(20), allowNull: false },
    ref_code: { type: DataTypes.STRING(255), allowNull: false },
    display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    timestamps: false,
  }
);

module.exports = CustomDisplayLink;
