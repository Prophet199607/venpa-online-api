const sequelize = require("../config/db");
const Department = require("./Department");
const Category = require("./Category");
const SubCategory = require("./SubCategory");
const Product = require("./Product");
const ProductImage = require("./ProductImage");
const SyncState = require("./SyncState");
const User = require("./auth");

Product.hasMany(ProductImage, { foreignKey: "prod_code", sourceKey: "prod_code", as: "images" });
ProductImage.belongsTo(Product, { foreignKey: "prod_code", targetKey: "prod_code", as: "product" });

module.exports = {
  sequelize,
  Department,
  Category,
  SubCategory,
  Product,
  SyncState,
  User,
};
