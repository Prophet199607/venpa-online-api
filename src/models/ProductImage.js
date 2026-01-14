const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ProductImage = sequelize.define("product_images", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  prod_code: { type: DataTypes.STRING(255), allowNull: false },
  image: { type: DataTypes.STRING(255), allowNull: false }
}, {
  timestamps: false
});

module.exports = ProductImage;
