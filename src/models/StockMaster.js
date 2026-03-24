const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const StockMaster = sequelize.define(
  "stock_masters",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    location: { type: DataTypes.STRING(10), allowNull: true },
    transaction_date: { type: DataTypes.STRING(19), allowNull: true },
    doc_no: { type: DataTypes.STRING(50), allowNull: true },
    prod_code: { type: DataTypes.STRING(10), allowNull: false },
    iid: { type: DataTypes.STRING(10), allowNull: true },
    u_id: { type: DataTypes.STRING(36), allowNull: true },
    qty: { type: DataTypes.DECIMAL(8, 3), allowNull: true, defaultValue: 0 },
    purchase_price: { type: DataTypes.DECIMAL(20, 2), allowNull: true, defaultValue: 0 },
    selling_price: { type: DataTypes.DECIMAL(20, 2), allowNull: true, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(20, 2), allowNull: true, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    timestamps: false,
  }
);

module.exports = StockMaster;
