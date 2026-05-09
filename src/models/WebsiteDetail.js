const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const WebsiteDetail = sequelize.define(
  "website_details",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    about_us: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    opening_hours: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    social_links: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of { platform: string, url: string }",
    },
    logos: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of image URLs or { type: string, url: string }",
    },
    locations: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of { name: string, address: string, map_link: string, phone: string }",
    },
    navbar_messages: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of { text: string, is_active: boolean, link: string }",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = WebsiteDetail;
