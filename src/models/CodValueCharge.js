const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CodValueCharge = sequelize.define(
  "cod_value_charges",
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    value_from: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    value_to: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    charge: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    created_at: { type: DataTypes.DATE },
    updated_at: { type: DataTypes.DATE },
  },
  {
    timestamps: false,
  },
);

module.exports = CodValueCharge;
