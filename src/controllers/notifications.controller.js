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
  } catch (e) { next(e); }
};

exports.unregisterToken = async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ message: "token is required" });

    await DeviceToken.destroy({ where: { user_id: req.user.id, token } });
    res.json({ message: "Token removed" });
  } catch (e) { next(e); }
};

exports.testNotification = async (req, res, next) => {
  try {
    const { title, body } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ message: "title and body are required" });
    }

    const { sendToUser } = require("../services/notifications/notificationService");
    await sendToUser(req.user.id, {
      title,
      body,
      data: { type: "test" },
    });

    res.json({ message: "Test notification sent" });
  } catch (e) { next(e); }
};
