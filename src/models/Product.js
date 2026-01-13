const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Product = sequelize.define("products", {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  prod_code: { type: DataTypes.STRING(255), allowNull: false },
  prod_name: { type: DataTypes.STRING(255), allowNull: false },
  short_description: { type: DataTypes.STRING(255), allowNull: true },

  department: { type: DataTypes.STRING(255), allowNull: false },
  category: { type: DataTypes.STRING(255), allowNull: true },
  sub_category: { type: DataTypes.STRING(255), allowNull: true },

  pack_size: { type: DataTypes.STRING(255), allowNull: true },

  purchase_price: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 0 },
  selling_price: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 0 },
  marked_price: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 0 },
  wholesale_price: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 0 },

  title_in_other_la: { type: DataTypes.STRING(255), allowNull: true },
  book_type: { type: DataTypes.STRING(255), allowNull: true },
  publisher: { type: DataTypes.STRING(255), allowNull: true },
  isbn: { type: DataTypes.STRING(255), allowNull: true },
  publish_year: { type: DataTypes.INTEGER, allowNull: true },

  alert_qty: { type: DataTypes.INTEGER, allowNull: true },
}, {
  timestamps: false
});

module.exports = Product;
