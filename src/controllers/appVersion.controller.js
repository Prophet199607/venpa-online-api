const { Op } = require("sequelize");
const { AppVersion } = require("../models");
const { normalizePlatform } = require("../services/notifications/platform");

const SUPPORTED_PLATFORMS = new Set(["1", "2"]); // 1: android, 2: ios

const PLATFORM_QUERY_MAP = {
  1: ["1", "android"],
  2: ["2", "ios"],
};

/**
 * Compare two semver/version strings (e.g. "1.0.0" vs "1.0.1").
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 == v2
 */
function compareVersions(v1, v2) {
  const clean1 = String(v1 || "")
    .trim()
    .replace(/^[vV]/, "");
  const clean2 = String(v2 || "")
    .trim()
    .replace(/^[vV]/, "");

  const p1 = clean1.split(".").map((n) => parseInt(n, 10));
  const p2 = clean2.split(".").map((n) => parseInt(n, 10));
  const maxLen = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = Number.isNaN(p1[i]) ? 0 : p1[i] || 0;
    const num2 = Number.isNaN(p2[i]) ? 0 : p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

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

    const currentVersion = String(current_version).trim();
    const platformCandidates = PLATFORM_QUERY_MAP[normalizedPlatform] || [
      normalizedPlatform,
    ];

    let row = await AppVersion.findOne({
      where: {
        platform: { [Op.in]: platformCandidates },
      },
    });

    if (!row) {
      // Auto-initialize default version row so the API gracefully succeeds
      try {
        const now = new Date();
        row = await AppVersion.create({
          platform: normalizedPlatform,
          latest_version: currentVersion,
          force_update: false,
          created_at: now,
          updated_at: now,
        });
      } catch (err) {
        row = await AppVersion.findOne({
          where: {
            platform: { [Op.in]: platformCandidates },
          },
        });
      }
    }

    if (!row) {
      return res.status(404).json({
        message: "Latest version is not configured for this platform",
      });
    }

    const newestVersion = String(row.latest_version).trim();

    // Check version:
    const versionDiff = compareVersions(currentVersion, newestVersion);
    const isLatest = currentVersion === newestVersion || versionDiff >= 0;
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
