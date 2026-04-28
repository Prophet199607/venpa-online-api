const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CouponUsage = sequelize.define(
  "coupon_usages",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    coupon_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    order_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ["user_id", "coupon_id"],
      },
    ],
  },
);

module.exports = CouponUsage;
