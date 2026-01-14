const sequelize = require("../config/db");
const Department = require("./Department");
const Category = require("./Category");
const SubCategory = require("./SubCategory");
const Product = require("./Product");
const ProductImage = require("./ProductImage");
const SyncState = require("./SyncState");
const User = require("./auth");


Product.hasMany(ProductImage, {
  foreignKey: "product_id",
  as: "images",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

ProductImage.belongsTo(Product, {
  foreignKey: "product_id",
  as: "product",
});

module.exports = {
  sequelize,
  Department,
  Category,
  SubCategory,
  Product,
  ProductImage, 
  SyncState,
  User,
};
