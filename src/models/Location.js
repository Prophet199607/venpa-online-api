const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Location = sequelize.define(
  "locations",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    loca_code: { type: DataTypes.STRING(255), allowNull: false },
    loca_name: { type: DataTypes.STRING(255), allowNull: false },
    location_type: { type: DataTypes.STRING(255), allowNull: true },
    delivery_address: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
  },
  {
    timestamps: false,
  }
);

module.exports = Location;
