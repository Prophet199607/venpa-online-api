const PLATFORM_CODE_BY_NAME = {
  android: "1",
  ios: "2",
  web: "3",
};

function normalizePlatform(platform) {
  if (platform === undefined || platform === null) return null;

  const value = String(platform).trim().toLowerCase();
  if (!value) return null;

  if (PLATFORM_CODE_BY_NAME[value]) {
    return PLATFORM_CODE_BY_NAME[value];
  }

  if (value === "1" || value === "2" || value === "3") {
    return value;
  }

  return null;
}

module.exports = {
  normalizePlatform,
  PLATFORM_CODE_BY_NAME,
};
