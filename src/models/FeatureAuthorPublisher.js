const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const FeatureAuthorPublisher = sequelize.define(
  "feature_author_publisher",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    code: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "auth_code or pub_code depending on type",
    },
    type: {
      type: DataTypes.ENUM("author", "publisher"),
      allowNull: false,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
  },
  { timestamps: true }
);

module.exports = FeatureAuthorPublisher;