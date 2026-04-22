const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const MediaAsset = sequelize.define(
  "media_assets",
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    image: { type: DataTypes.TEXT("long"), allowNull: true },
    mobile_image: { type: DataTypes.TEXT("long"), allowNull: true },
    type: {
      type: DataTypes.ENUM("carousel", "banner"),
      allowNull: false,
    },
    placement_key: { type: DataTypes.STRING(100), allowNull: true },
    position: { type: DataTypes.INTEGER, defaultValue: 0 },
    orientation: {
      type: DataTypes.ENUM("horizontal", "panoramic"),
      allowNull: true,
    },
    link: { type: DataTypes.STRING(255), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    created_at: { type: DataTypes.DATE },
    updated_at: { type: DataTypes.DATE },
  },
  {
    timestamps: false,
  },
);

module.exports = MediaAsset;
