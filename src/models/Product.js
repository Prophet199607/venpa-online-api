const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

function withProductImageBaseUrl(value) {
  if (!value) return value;

  const raw = String(value).trim();
  if (!raw) return raw;

  if (/^https?:\/\//i.test(raw)) return raw;

  const base = String(process.env.PRODUCT_IMAGE_BASE_URL || "").trim();
  if (!base) return raw;

  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = raw.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
}

const Product = sequelize.define("products", {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  prod_code: { type: DataTypes.STRING(255), allowNull: false },
  prod_name: { type: DataTypes.STRING(255), allowNull: false },
  short_description: { type: DataTypes.STRING(255), allowNull: true },

  department: { type: DataTypes.STRING(255), allowNull: false },
  category: { type: DataTypes.STRING(255), allowNull: true },
  sub_category: { type: DataTypes.STRING(255), allowNull: true },

  pack_size: { type: DataTypes.STRING(255), allowNull: true },

  purchase_price: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 0 },
  selling_price: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 0 },
  discount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
  dis_per: { type: DataTypes.DECIMAL(5, 2), allowNull: true, defaultValue: 0 },
  dis_start_date: { type: DataTypes.STRING(20), allowNull: true },
  dis_end_date: { type: DataTypes.STRING(20), allowNull: true },
  marked_price: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 0 },
  wholesale_price: { type: DataTypes.DECIMAL(8, 2), allowNull: true, defaultValue: 0 },
  unconfirm_price: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
  
  title_in_other_language: { type: DataTypes.STRING(255), allowNull: true },
  tamil_description: { type: DataTypes.STRING(255), allowNull: true },
  book_type: { type: DataTypes.STRING(255), allowNull: true },
  publisher: { type: DataTypes.STRING(255), allowNull: true },
  isbn: { type: DataTypes.STRING(255), allowNull: true },
  publish_year: { type: DataTypes.INTEGER, allowNull: true },
  issue_date: { type: DataTypes.DATE, allowNull: true },
  pages: { type: DataTypes.INTEGER, allowNull: true },
  width: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
  height: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
  depth: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
  weight: { type: DataTypes.INTEGER, allowNull: true },
  barcode: { type: DataTypes.STRING(255), allowNull: true },
  language: { type: DataTypes.STRING(255), allowNull: true },
  prod_image: {
    type: DataTypes.STRING(255),
    allowNull: true,
    get() {
      return withProductImageBaseUrl(this.getDataValue("prod_image"));
    },
  },
  description: { type: DataTypes.TEXT("long"), allowNull: true },

  alert_qty: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
  unit_name: { type: DataTypes.STRING(255), allowNull: true, defaultValue: "NOS" },
  created_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  updated_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: true },
  updated_at: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: false
});

module.exports = Product;
