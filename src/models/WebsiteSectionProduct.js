const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const WebsiteSectionProduct = sequelize.define(
  "website_section_products",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    prod_code: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    section_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["section_type", "prod_code"],
      },
    ],
  },
);

module.exports = WebsiteSectionProduct;
