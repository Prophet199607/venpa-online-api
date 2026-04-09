const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Language = sequelize.define(
  "languages",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    lang_code: { type: DataTypes.STRING(255), allowNull: false },
    lang_name: { type: DataTypes.STRING(255), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    timestamps: false,
  }
);

module.exports = Language;
