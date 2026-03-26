const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PickAndCollect = sequelize.define(
  "pick_and_collects",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    pick_and_collect_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    prod_code: { type: DataTypes.STRING(255), allowNull: false },
    location: { type: DataTypes.STRING(255), allowNull: false },
    type: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    picked_qty: { type: DataTypes.DECIMAL(8, 3), allowNull: false },
    status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: "pending" },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false }
);

module.exports = PickAndCollect;
