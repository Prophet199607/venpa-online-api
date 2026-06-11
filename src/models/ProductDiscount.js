const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ProductDiscount = sequelize.define(
  "product_discounts",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    prod_code: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
    },
    discount_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0,
    },
    start_date: { type: DataTypes.STRING(20), allowNull: true },
    end_date: { type: DataTypes.STRING(20), allowNull: true },
    status: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
  },
  {
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

module.exports = ProductDiscount;
