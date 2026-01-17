const sequelize = require("../config/db");
const Department = require("./Department");
const Category = require("./Category");
const SubCategory = require("./SubCategory");
const Product = require("./Product");
const ProductImage = require("./ProductImage");
const SyncState = require("./SyncState");
const User = require("./auth");
const Cart = require("./Cart");
const CartItem = require("./CartItem");
const Wishlist = require("./Wishlist");

// Associations
Department.hasMany(Category, { foreignKey: "dep_code", sourceKey: "dep_code" });
Category.belongsTo(Department, {
  foreignKey: "department",
  targetKey: "dep_code",
  as: "departmentDetails",
});

Category.hasMany(SubCategory, {
  foreignKey: "cat_code",
  sourceKey: "cat_code",
});

SubCategory.belongsTo(Category, {
  foreignKey: "cat_code",
  targetKey: "cat_code",
});

// Product Relations
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

// Cart Relations
User.hasOne(Cart, { foreignKey: "user_id" });
Cart.belongsTo(User, { foreignKey: "user_id" });

Cart.hasMany(CartItem, { foreignKey: "cart_id" });
CartItem.belongsTo(Cart, { foreignKey: "cart_id" });

CartItem.belongsTo(Product, { foreignKey: "product_id" });
Product.hasMany(CartItem, { foreignKey: "product_id" });

// Wishlist Relations
User.hasMany(Wishlist, { foreignKey: "user_id" });
Wishlist.belongsTo(User, { foreignKey: "user_id" });

Wishlist.belongsTo(Product, { foreignKey: "product_id" });
Product.hasMany(Wishlist, { foreignKey: "product_id" });

module.exports = {
  sequelize,
  Department,
  Category,
  SubCategory,
  Product,
  ProductImage,
  SyncState,
  User,
  Cart,
  CartItem,
  Wishlist,
};
