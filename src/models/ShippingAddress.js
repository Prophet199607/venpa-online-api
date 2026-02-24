const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ShippingAddress = sequelize.define(
  "shipping_addresses",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    is_gift: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    receiver_fname: { type: DataTypes.STRING(255), allowNull: false },
    receiver_lname: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(255), allowNull: false },
    delivery_address: { type: DataTypes.STRING(500), allowNull: false },
    city: { type: DataTypes.STRING(100), allowNull: false },
    province: { type: DataTypes.STRING(100), allowNull: false },
    postal_code: { type: DataTypes.STRING(20), allowNull: false },
    country: { type: DataTypes.STRING(100), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false }
);

module.exports = ShippingAddress;
