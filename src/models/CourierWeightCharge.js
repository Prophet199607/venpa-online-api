const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CourierWeightCharge = sequelize.define(
  "courier_weight_charges",
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    weight_from: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    weight_to: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    charge: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    created_at: { type: DataTypes.DATE },
    updated_at: { type: DataTypes.DATE },
  },
  {
    timestamps: false,
  },
);

module.exports = CourierWeightCharge;
