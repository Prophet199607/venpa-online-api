const appleSignin = require("apple-signin-auth");

/**
 * Retrieves configured Apple Client/Bundle IDs from environment variables.
 * Supports comma-separated IDs (e.g. iOS Bundle ID, Web Service ID).
 * @returns {string[]}
 */
function getAppleClientIds() {
  const rawId = process.env.APPLE_CLIENT_ID;

  if (!rawId) {
    return [];
  }

  return rawId
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parses user's full name from string or Apple authorization object.
 * @param {string | { firstName?: string, lastName?: string }} name
 * @param {string} [fallbackEmail]
 * @returns {{ fname: string, lname: string }}
 */
function parseFullName(name, fallbackEmail = "") {
  if (!name) {
    const fallback = fallbackEmail ? fallbackEmail.split("@")[0] : "Apple User";
    return { fname: fallback, lname: "" };
  }

  if (typeof name === "object") {
    const fname = (name.firstName || name.givenName || "").trim();
    const lname = (name.lastName || name.familyName || "").trim();
    return {
      fname: fname || "Apple User",
      lname,
    };
  }

  const parts = String(name).trim().split(/\s+/);
  const fname = parts[0] || "Apple User";
  const lname = parts.slice(1).join(" ") || "";
  return { fname, lname };
}

/**
 * Verifies an Apple Identity Token against Apple's live JWKS servers.
 * Validates token signature, issuer (https://appleid.apple.com), audience, and expiry.
 *
 * @param {string} identityToken - Raw JWT string from Apple authorization response
 * @returns {Promise<Object>} Decoded and verified token claims (e.g., sub, email)
 */
async function verifyAppleToken(identityToken) {
  if (!identityToken) {
    throw new Error("identityToken is required");
  }

  const clientIds = getAppleClientIds();
  if (clientIds.length === 0) {
    throw new Error("Apple client IDs not configured in environment variables");
  }

  const payload = await appleSignin.verifyIdToken(identityToken, {
    audience: clientIds.length === 1 ? clientIds[0] : clientIds,
    ignoreExpiration: false,
  });

  return payload;
}

module.exports = {
  getAppleClientIds,
  parseFullName,
  verifyAppleToken,
};
