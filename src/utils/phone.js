/**
 * Phone Number Utilities for Sri Lankan Numbers
 * Provides consistent normalization across the application.
 */

/**
 * Normalize a Sri Lankan mobile number to international format (94XXXXXXXXX).
 * Returns null when the input is not a valid mobile number.
 *
 * @param {string} phone - Phone number in any format
 * @returns {string|null} - Normalized phone in 94XXXXXXXXX format, or null if invalid
 */
const normalizePhone = (phone) => {
  let digits = String(phone || "").replace(/\D/g, "");

  if (digits.startsWith("0") && digits.length === 10) {
    digits = "94" + digits.slice(1);
  } else if (digits.length === 9) {
    digits = "94" + digits;
  }

  // Valid Sri Lankan mobile numbers: 9470XXXXXXX, 9471XXXXXXX, ..., 9479XXXXXXX
  // Covers all valid prefixes: 070, 071, 072, 074, 075, 076, 077, 078, 079
  if (!/^94(7[0-9]\d{7})$/.test(digits)) {
    return null;
  }

  return digits;
};

/**
 * Convert international format (94XXXXXXXXX) to local format (07XXXXXXXX).
 * Used for Koko API which expects local format.
 *
 * @param {string} phone - Phone number in international format (947XXXXXXXX)
 * @returns {string|null} - Phone in local format (07XXXXXXXX), or null if invalid
 */
const toLocalFormat = (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  // Convert 947XXXXXXXX -> 07XXXXXXXX
  if (normalized.startsWith("94")) {
    return "0" + normalized.slice(2);
  }
  return null;
};

/**
 * Convert local format (07XXXXXXXX) to international format (94XXXXXXXXX).
 *
 * @param {string} phone - Phone number in local format (07XXXXXXXX)
 * @returns {string|null} - Phone in international format (94XXXXXXXXX), or null if invalid
 */
const toInternationalFormat = (phone) => {
  let digits = String(phone || "").replace(/\D/g, "");

  if (digits.startsWith("0") && digits.length === 10) {
    return "94" + digits.slice(1);
  }
  return null;
};

/**
 * Validate if a phone number is a valid Sri Lankan mobile.
 *
 * @param {string} phone - Phone number in any format
 * @returns {boolean} - True if valid
 */
const isValidSriLankanMobile = (phone) => {
  return normalizePhone(phone) !== null;
};

/**
 * Get phone in format required by Koko API (local format: 07XXXXXXXX).
 *
 * @param {string} phone - Phone number in any format
 * @returns {string|null} - Phone in Koko format (07XXXXXXXX), or null if invalid
 */
const toKokoFormat = (phone) => {
  return toLocalFormat(phone);
};

module.exports = {
  normalizePhone,
  toLocalFormat,
  toInternationalFormat,
  isValidSriLankanMobile,
  toKokoFormat,
};
