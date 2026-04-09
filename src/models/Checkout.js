const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Checkout = sequelize.define(
  "checkouts",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      unique: true,
    },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    type: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    type_name: { type: DataTypes.STRING(255), allowNull: true },
    payload: { type: DataTypes.JSON, allowNull: false },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "pending",
    },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false },
);

module.exports = Checkout;
