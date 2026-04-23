const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const NotificationLog = sequelize.define(
  "notification_logs",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: true },
    type: { type: DataTypes.STRING(50), allowNull: true },
    data: { type: DataTypes.JSON, allowNull: true },
    is_read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  },
  { timestamps: false },
);

module.exports = NotificationLog;
