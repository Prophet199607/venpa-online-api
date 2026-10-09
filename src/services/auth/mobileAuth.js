const crypto = require("crypto");
const { normalizePlatform } = require("../notifications/platform");

// ============================================================================
// OTP-less mobile login (store-review bypass)
// ============================================================================
//   1 = android, 2 = ios, 3 = web
const MOBILE_PLATFORM_CODES = new Set(["1", "2"]);
const REVIEW_KEY_HEADER = "x-mobile-review-key";

/**
 * Normalize a Sri Lankan mobile number to the 94XXXXXXXXX format.
 * Returns null when the input is not a valid mobile number.
 */
const normalizePhone = (phone) => {
  let digits = String(phone || "").replace(/\D/g, "");

  if (digits.startsWith("0") && digits.length === 10) {
    digits = "94" + digits.slice(1);
  } else if (digits.length === 9) {
    digits = "94" + digits;
  }

  // Valid Sri Lankan mobile numbers only: 947XXXXXXXX
  if (!/^94(7\d{8})$/.test(digits)) {
    return null;
  }

  return digits;
};

/**
 * OTP-less login is opt-in and must be explicitly enabled in the environment.
 */
const isMobileBypassEnabled = () => {
  return (
    String(process.env.MOBILE_BYPASS_LOGIN_ENABLED || "")
      .trim()
      .toLowerCase() === "true"
  );
};

/**
 * Configured bypass numbers from the environment, normalized to 94XXXXXXXXX.
 */
const getBypassPhones = () => {
  const raw =
    process.env.MOBILE_BYPASS_LOGIN_PHONES ||
    process.env.MOBILE_BYPASS_LOGIN_PHONE ||
    "";

  return String(raw)
    .split(",")
    .map((value) => normalizePhone(value))
    .filter(Boolean);
};

const getBypassExpiry = () => {
  const raw = process.env.MOBILE_BYPASS_LOGIN_EXPIRES_AT;
  if (!raw) return null;

  const ts = Date.parse(String(raw).trim());
  if (Number.isNaN(ts)) {
    console.error(
      `[auth] MOBILE_BYPASS_LOGIN_EXPIRES_AT is not a valid date ("${raw}"). Bypass treated as expired.`,
    );
    return 0;
  }

  return ts;
};

const isBypassExpired = () => {
  const expiry = getBypassExpiry();
  return expiry !== null && Date.now() > expiry;
};

/**
 * Constant-time string comparison to avoid leaking the secret via timing.
 */
const safeEqual = (a, b) => {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));

  if (aBuf.length !== bBuf.length) return false;

  return crypto.timingSafeEqual(aBuf, bBuf);
};

/**
 * Validates the optional shared secret.
 */
const isReviewKeyValid = (providedKey) => {
  const secret = process.env.MOBILE_BYPASS_LOGIN_SECRET || "";

  if (!secret) return true;
  if (!providedKey) return false;

  return safeEqual(providedKey, secret);
};

/**
 * True when the supplied platform is a native mobile platform (android/ios).
 * Accepts "android"/"ios" or the numeric codes 1/2. Web (3) is not allowed.
 */
const isMobilePlatform = (platform) => {
  const code = normalizePlatform(platform);
  return code !== null && MOBILE_PLATFORM_CODES.has(code);
};

/**
 * Single gate for the OTP-less login. Returns true only when every control
 * passes. `providedKey` is the value of the x-mobile-review-key header.
 */
const isMobileBypassLogin = (phone, platform, providedKey) => {
  if (!isMobileBypassEnabled()) return false;
  if (isBypassExpired()) return false;
  if (!isMobilePlatform(platform)) return false;
  if (!isReviewKeyValid(providedKey)) return false;

  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  return getBypassPhones().includes(normalized);
};

/**
 * Emit configuration warnings once at startup so a misconfigured bypass is
 * obvious in the logs rather than silently failing or silently open.
 */
const validateBypassConfig = () => {
  if (!isMobileBypassEnabled()) return;

  const phones = getBypassPhones();

  if (phones.length === 0) {
    console.error(
      "[auth] MOBILE_BYPASS_LOGIN_ENABLED=true but no valid MOBILE_BYPASS_LOGIN_PHONES configured. Bypass will reject every request.",
    );
  }

  if (!process.env.MOBILE_BYPASS_LOGIN_SECRET) {
    console.warn(
      "[auth] MOBILE_BYPASS_LOGIN_ENABLED=true without MOBILE_BYPASS_LOGIN_SECRET. Set the secret and send the x-mobile-review-key header for stronger protection.",
    );
  }

  if (isBypassExpired()) {
    console.warn(
      "[auth] MOBILE_BYPASS_LOGIN_EXPIRES_AT has passed. OTP-less mobile login is disabled.",
    );
  }
};

validateBypassConfig();

module.exports = {
  normalizePhone,
  isMobileBypassLogin,
  isMobilePlatform,
  isMobileBypassEnabled,
  isBypassExpired,
  getBypassPhones,
  REVIEW_KEY_HEADER,
};
