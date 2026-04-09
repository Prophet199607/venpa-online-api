const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ProductAuthor = sequelize.define(
  "product_authors",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    prod_code: { type: DataTypes.STRING(255), allowNull: false },
    author_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    auth_code: { type: DataTypes.STRING(255), allowNull: true },
  },
  { timestamps: false }
);

module.exports = ProductAuthor;
