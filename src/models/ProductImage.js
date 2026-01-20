const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ProductImage = sequelize.define(
  "ProductImage",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },

    prod_code: { type: DataTypes.STRING(255), allowNull: false },
    image: { type: DataTypes.STRING(255), allowNull: false },

    product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

    created_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    updated_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "product_images",
    timestamps: false,
  }
);

module.exports = ProductImage;
