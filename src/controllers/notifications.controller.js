const { Op } = require("sequelize");
const { NotificationLog } = require("../models");

/**
 * GET /api/v1/notifications
 * Returns the authenticated user's notifications newest-first.
 * Supports ?page=1&limit=20 and ?unread_only=true
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unread_only === "true";

    const where = { user_id: userId };
    if (unreadOnly) where.is_read = false;

    const { count, rows } = await NotificationLog.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      offset,
      attributes: [
        "id",
        "title",
        "body",
        "type",
        "data",
        "is_read",
        "created_at",
      ],
    });

    res.json({
      total: count,
      page,
      limit,
      unread: rows.filter((n) => !n.is_read).length,
      notifications: rows,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a specific notification as read.
 */
exports.markRead = async (req, res, next) => {
  try {
    const notification = await NotificationLog.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    await notification.update({ is_read: true, updated_at: new Date() });
    res.json({ message: "Notification marked as read" });
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all of the user's notifications as read.
 */
exports.markAllRead = async (req, res, next) => {
  try {
    await NotificationLog.update(
      { is_read: true, updated_at: new Date() },
      { where: { user_id: req.user.id, is_read: false } },
    );
    res.json({ message: "All notifications marked as read" });
  } catch (e) {
    next(e);
  }
};

// ─── Device-token helpers (unchanged) ───────────────────────────────────────

const { DeviceToken } = require("../models");
const { normalizePlatform } = require("../services/notifications/platform");

exports.registerToken = async (req, res, next) => {
  try {
    const { token, platform } = req.body || {};
    if (!token) return res.status(400).json({ message: "token is required" });

    const normalizedPlatform = normalizePlatform(platform);
    if (platform !== undefined && normalizedPlatform === null) {
      return res.status(400).json({
        message: "platform must be android/ios/web or 1/2/3",
      });
    }

    const [row, created] = await DeviceToken.findOrCreate({
      where: { user_id: req.user.id, token },
      defaults: {
        user_id: req.user.id,
        token,
        platform: normalizedPlatform,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    if (!created) {
      await row.update({
        platform: normalizedPlatform || row.platform,
        updated_at: new Date(),
      });
    }

    res.json({
      message: "Token registered",
      platform: normalizedPlatform || row.platform || null,
    });
  } catch (e) {
    next(e);
  }
};

exports.unregisterToken = async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ message: "token is required" });

    await DeviceToken.destroy({ where: { user_id: req.user.id, token } });
    res.json({ message: "Token removed" });
  } catch (e) {
    next(e);
  }
};

exports.testNotification = async (req, res, next) => {
  try {
    const { title, body } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ message: "title and body are required" });
    }

    const {
      sendToUser,
    } = require("../services/notifications/notificationService");
    await sendToUser(req.user.id, {
      title,
      body,
      data: { type: "test" },
    });

    res.json({ message: "Test notification sent" });
  } catch (e) {
    next(e);
  }
};
