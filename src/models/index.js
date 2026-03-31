const sequelize = require("../config/db");
const Department = require("./Department");
const Category = require("./Category");
const SubCategory = require("./SubCategory");
const Product = require("./Product");
const ProductSubCategory = require("./ProductSubCategory");
const Publisher = require("./Publisher");
const BookType = require("./BookType");
const Author = require("./Author");
const Language = require("./Language");
const Location = require("./Location");
const ProductAuthor = require("./ProductAuthor");
const CustomNavItem = require("./CustomNavItem");
const ProductImage = require("./ProductImage");
const StockMaster = require("./StockMaster");
const SyncState = require("./SyncState");
const User = require("./auth");
const Cart = require("./Cart");
const CartItem = require("./CartItem");
const Wishlist = require("./Wishlist");
const Review = require("./Review");
const Checkout = require("./Checkout");
const EmailVerification = require("./EmailVerification");
const PasswordReset = require("./PasswordReset");
const EmailChange = require("./EmailChange");
const PublicEmailOtp = require("./PublicEmailOtp");
const DeviceToken = require("./DeviceToken");
const AppVersion = require("./AppVersion");
const ShippingAddress = require("./ShippingAddress");
const PickAndCollect = require("./PickAndCollect");

// Associations
Department.hasMany(Category, {
  foreignKey: "dep_code",
  sourceKey: "dep_code",
  constraints: false,
});
Category.belongsTo(Department, {
  foreignKey: "department",
  targetKey: "dep_code",
  as: "departmentDetails",
  constraints: false,
});

Category.hasMany(SubCategory, {
  foreignKey: "cat_code",
  sourceKey: "cat_code",
  constraints: false,
});

SubCategory.belongsTo(Category, {
  foreignKey: "cat_code",
  targetKey: "cat_code",
  constraints: false,
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
Product.hasMany(ProductSubCategory, {
  foreignKey: "prod_code",
  sourceKey: "prod_code",
  constraints: false,
  as: "productSubCategories",
});
ProductSubCategory.belongsTo(Product, {
  foreignKey: "prod_code",
  targetKey: "prod_code",
  constraints: false,
  as: "product",
});
SubCategory.hasMany(ProductSubCategory, {
  foreignKey: "sub_category_id",
  sourceKey: "id",
  constraints: false,
  as: "productSubCategories",
});
ProductSubCategory.belongsTo(SubCategory, {
  foreignKey: "sub_category_id",
  targetKey: "id",
  constraints: false,
  as: "subcategory",
});
Publisher.hasMany(Product, {
  foreignKey: "publisher",
  sourceKey: "pub_code",
  constraints: false,
});
Product.belongsTo(Publisher, {
  foreignKey: "publisher",
  targetKey: "pub_code",
  as: "publisherDetails",
  constraints: false,
});
Product.hasMany(StockMaster, {
  foreignKey: "prod_code",
  sourceKey: "prod_code",
  constraints: false,
  as: "stockEntries",
});
StockMaster.belongsTo(Product, {
  foreignKey: "prod_code",
  targetKey: "prod_code",
  constraints: false,
  as: "product",
});

// Cart Relations
User.hasOne(Cart, { foreignKey: "user_id" });
Cart.belongsTo(User, { foreignKey: "user_id" });

Cart.hasMany(CartItem, { foreignKey: "cart_id", as: "items" });
CartItem.belongsTo(Cart, { foreignKey: "cart_id", as: "cart" });

CartItem.belongsTo(Product, { foreignKey: "product_id" });
Product.hasMany(CartItem, { foreignKey: "product_id" });

// Wishlist Relations
User.hasMany(Wishlist, { foreignKey: "user_id" });
Wishlist.belongsTo(User, { foreignKey: "user_id" });

Wishlist.belongsTo(Product, { foreignKey: "product_id" });
Product.hasMany(Wishlist, { foreignKey: "product_id" });

// Reviews
User.hasMany(Review, { foreignKey: "user_id" });
Review.belongsTo(User, { foreignKey: "user_id" });
Product.hasMany(Review, { foreignKey: "product_id" });
Review.belongsTo(Product, { foreignKey: "product_id" });

// Checkouts
User.hasMany(Checkout, { foreignKey: "user_id" });
Checkout.belongsTo(User, { foreignKey: "user_id" });
User.hasMany(PickAndCollect, { foreignKey: "user_id" });
PickAndCollect.belongsTo(User, { foreignKey: "user_id" });

Product.hasMany(PickAndCollect, {
  foreignKey: "prod_code",
  sourceKey: "prod_code",
  constraints: false,
  as: "pickAndCollectRequests",
});
PickAndCollect.belongsTo(Product, {
  foreignKey: "prod_code",
  targetKey: "prod_code",
  constraints: false,
  as: "product",
});

Location.hasMany(PickAndCollect, {
  foreignKey: "location",
  sourceKey: "loca_code",
  constraints: false,
  as: "pickAndCollectRequests",
});
PickAndCollect.belongsTo(Location, {
  foreignKey: "location",
  targetKey: "loca_code",
  constraints: false,
  as: "locationDetails",
});

// Email verification
User.hasMany(EmailVerification, { foreignKey: "user_id" });
EmailVerification.belongsTo(User, { foreignKey: "user_id" });

// Password resets
User.hasMany(PasswordReset, { foreignKey: "user_id" });
PasswordReset.belongsTo(User, { foreignKey: "user_id" });

// Email change
User.hasMany(EmailChange, { foreignKey: "user_id" });
EmailChange.belongsTo(User, { foreignKey: "user_id" });

// Device tokens
User.hasMany(DeviceToken, { foreignKey: "user_id" });
DeviceToken.belongsTo(User, { foreignKey: "user_id" });
User.hasOne(ShippingAddress, { foreignKey: "user_id" });
ShippingAddress.belongsTo(User, { foreignKey: "user_id" });

module.exports = {
  sequelize,
  Department,
  Category,
  SubCategory,
  Product,
  ProductSubCategory,
  Publisher,
  BookType,
  Author,
  Language,
  Location,
  ProductAuthor,
  CustomNavItem,
  ProductImage,
  StockMaster,
  SyncState,
  User,
  Cart,
  CartItem,
  Wishlist,
  Review,
  Checkout,
  EmailVerification,
  PasswordReset,
  EmailChange,
  PublicEmailOtp,
  DeviceToken,
  AppVersion,
  ShippingAddress,
  PickAndCollect,
};
