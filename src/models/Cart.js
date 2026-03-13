const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Cart = sequelize.define("carts", {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
  status: { type: DataTypes.STRING, defaultValue: "active" },
});

module.exports = Cart;