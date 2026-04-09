const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ProductSubCategory = sequelize.define(
  "product_sub_categories",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    prod_code: { type: DataTypes.STRING(255), allowNull: false },
    sub_category_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    created_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    updated_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false }
);

module.exports = ProductSubCategory;
