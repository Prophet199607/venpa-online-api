const sequelize = require("../config/db");
const Department = require("./Department");
const Category = require("./Category");
const SubCategory = require("./SubCategory");
const Product = require("./Product");
const SyncState = require("./SyncState");

module.exports = {
  sequelize,
  Department,
  Category,
  SubCategory,
  Product,
  SyncState
};
