const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Wishlist = sequelize.define("wishlists", {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: { type: DataTypes.BIGINT, allowNull: false },
  product_id: { type: DataTypes.BIGINT, allowNull: false },
});

module.exports = Wishlist;
