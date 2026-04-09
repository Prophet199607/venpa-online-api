const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const BOOK_TYPES_TABLE = process.env.BOOK_TYPES_TABLE || "book_types";

const BookType = sequelize.define(
  BOOK_TYPES_TABLE,
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    book_type: { type: DataTypes.STRING(255), allowNull: false },
    book_type_name: { type: DataTypes.STRING(255), allowNull: true },
  },
  { timestamps: false }
);

module.exports = BookType;
