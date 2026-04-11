const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PublicPhoneOtp = sequelize.define(
  "public_phone_otps",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    code: { type: DataTypes.STRING(10), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false },
);

module.exports = PublicPhoneOtp;
