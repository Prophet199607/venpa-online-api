const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SyncState = sequelize.define("sync_state", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  entity: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  last_synced_at: { type: DataTypes.DATE, allowNull: true }
}, { timestamps: false });

module.exports = SyncState;
