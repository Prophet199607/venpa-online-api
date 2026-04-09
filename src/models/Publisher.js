const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Publisher = sequelize.define(
  "publishers",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    pub_code: { type: DataTypes.STRING(255), allowNull: false },
    pub_name: { type: DataTypes.STRING(255), allowNull: false },
    website: { type: DataTypes.STRING(255), allowNull: true },
    contact: { type: DataTypes.STRING(255), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    pub_image: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
  },
  {
    timestamps: false,
  }
);

module.exports = Publisher;
