const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const StockRequest = sequelize.define(
  "stock_requests",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false },
    phone_no: { type: DataTypes.STRING(50), allowNull: true },
    message: { type: DataTypes.TEXT, allowNull: true },
    prod_code: { type: DataTypes.STRING(255), allowNull: false },
    prod_name: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    notified_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false, tableName: "stock_requests" }
);

module.exports = StockRequest;