const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Publisher = sequelize.define(
  "publishers",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    pub_code: { type: DataTypes.STRING(255), allowNull: false },
    pub_name: { type: DataTypes.STRING(255), allowNull: true },
    website: { type: DataTypes.STRING(255), allowNull: true },
    contact: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    timestamps: false,
  }
);

module.exports = Publisher;
