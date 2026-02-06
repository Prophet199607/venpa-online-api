const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const DeviceToken = sequelize.define(
  "device_tokens",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    token: { type: DataTypes.STRING(500), allowNull: false },
    platform: { type: DataTypes.STRING(20), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false }
);

module.exports = DeviceToken;
