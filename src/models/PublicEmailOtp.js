const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PublicEmailOtp = sequelize.define(
  "public_email_otps",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(255), allowNull: false },
    code: { type: DataTypes.STRING(10), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false }
);

module.exports = PublicEmailOtp;
