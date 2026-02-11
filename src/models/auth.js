const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = sequelize.define(
  "users",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    fname: { type: DataTypes.STRING(255), allowNull: false },
    lname: { type: DataTypes.STRING(255), allowNull: false },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    phone: { type: DataTypes.STRING(255), allowNull: false },
    country: { type: DataTypes.STRING(100), allowNull: true },
    address: { type: DataTypes.STRING(255), allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    province: { type: DataTypes.STRING(100), allowNull: true },
    postal_code: { type: DataTypes.STRING(20), allowNull: true },
    password: { type: DataTypes.STRING(255), allowNull: false },
    auth_provider: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "local" },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  },
  {
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed("password")) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
    },
  }
);

User.prototype.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

User.prototype.generateToken = function () {
  return jwt.sign({ id: this.id, email: this.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

module.exports = User;
