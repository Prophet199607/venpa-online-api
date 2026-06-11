const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ProductDiscountLog = sequelize.define(
  "product_discount_logs",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    product_discount_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    prod_code: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    action: {
      type: DataTypes.ENUM(
        "created",
        "updated",
        "deleted",
        "duplicate_removed",
      ),
      allowNull: false,
    },
    old_values: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    new_values: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    changed_by: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
  },
  {
    timestamps: true,
    underscored: true,
    createdAt: "changed_at",
    updatedAt: false,
    indexes: [
      {
        fields: ["prod_code"],
      },
      {
        fields: ["changed_by"],
      },
      {
        fields: ["action"],
      },
    ],
  },
);

module.exports = ProductDiscountLog;
