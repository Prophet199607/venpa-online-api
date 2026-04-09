const { AppVersion } = require("../models");
const { normalizePlatform } = require("../services/notifications/platform");

const SUPPORTED_PLATFORMS = new Set(["1", "2"]); // android, ios

exports.checkLatestVersion = async (req, res, next) => {
  try {
    const { platform, current_version } = req.body || {};

    if (!platform || !current_version) {
      return res.status(400).json({
        message: "platform and current_version are required",
      });
    }

    const normalizedPlatform = normalizePlatform(platform);
    if (!normalizedPlatform || !SUPPORTED_PLATFORMS.has(normalizedPlatform)) {
      return res.status(400).json({
        message: "platform must be android/ios or 1/2",
      });
    }

    const row = await AppVersion.findOne({
      where: { platform: normalizedPlatform },
    });

    if (!row) {
      return res.status(404).json({
        message: "Latest version is not configured for this platform",
      });
    }

    const currentVersion = String(current_version).trim();
    const newestVersion = String(row.latest_version).trim();
    const isLatest = currentVersion === newestVersion;
    const mustUpdate = !isLatest && Boolean(row.force_update);

    return res.json({
      platform: normalizedPlatform,
      current_version: currentVersion,
      newest_version: newestVersion,
      is_latest: isLatest,
      must_update: mustUpdate,
    });
  } catch (e) {
    next(e);
  }
};
