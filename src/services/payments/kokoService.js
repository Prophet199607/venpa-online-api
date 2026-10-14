const crypto = require("crypto");
const axios = require("axios");
const querystring = require("querystring");
const { toKokoFormat } = require("../../utils/phone");

const SUCCESS_STATUSES = new Set([
  "success",
  "succeeded",
  "completed",
  "paid",
  "approved",
]);
const FAILED_STATUSES = new Set([
  "failed",
  "fail",
  "rejected",
  "declined",
  "failure",
]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled"]);

// Koko's order API cannot process non-ASCII characters in its signed fields
// (merchant id, amount, names, email, description, ...). Sending e.g. Tamil or
// Sinhala product names causes an opaque SYSTEM_ERROR (500) or a hang. Because
// the same value is both signed (dataString) and posted as a form field, we must
// sanitize it once, before either step, so the signature stays consistent.
function toAsciiSafe(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  let str = String(value);
  // Convert accented Latin letters to their ASCII base (é -> e).
  str = str.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  // Normalize common typographic punctuation to ASCII equivalents.
  str = str
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
  // Drop any remaining non-printable-ASCII characters (Tamil, Sinhala, emoji...).
  str = str.replace(/[^\x20-\x7E]/g, "");
  // Collapse repeated whitespace introduced above.
  str = str.replace(/\s+/g, " ").trim();
  return str || fallback;
}

let cachedConfig = null;

function getMerchantId() {
  return String(process.env.KOKO_MID || "").trim();
}

function getApiKey() {
  return String(process.env.KOKO_API_KEY || "").trim();
}

function getPrivateKey() {
  const key = process.env.KOKO_PRIVATE_KEY;
  if (!key) return null;
  // Handle both single-line (with \n) and multi-line keys
  let formattedKey = key.replace(/\\n/g, "\n").trim();

  // Ensure proper PEM format with line breaks every 64 chars
  if (formattedKey.includes("-----BEGIN") && !formattedKey.includes("\n")) {
    // Key is on single line, need to format it
    const headerMatch = formattedKey.match(
      /-----(BEGIN [A-Z ]+ PRIVATE KEY)-----/,
    );
    const footerMatch = formattedKey.match(
      /-----(END [A-Z ]+ PRIVATE KEY)-----/,
    );
    if (headerMatch && footerMatch) {
      const header = headerMatch[0];
      const footer = footerMatch[0];
      const body = formattedKey.replace(header, "").replace(footer, "").trim();
      // Add line breaks every 64 characters
      const formattedBody = body.match(/.{1,64}/g).join("\n");
      formattedKey = `${header}\n${formattedBody}\n${footer}`;
    }
  }

  return formattedKey;
}

function getKokoPublicKey() {
  const key = process.env.KOKO_PUBLIC_KEY;
  if (!key) return null;
  let formattedKey = key.replace(/\\n/g, "\n").trim();

  // Ensure proper PEM format with line breaks every 64 chars
  if (formattedKey.includes("-----BEGIN") && !formattedKey.includes("\n")) {
    const headerMatch = formattedKey.match(
      /-----(BEGIN [A-Z ]+ PUBLIC KEY)-----/,
    );
    const footerMatch = formattedKey.match(
      /-----(END [A-Z ]+ PUBLIC KEY)-----/,
    );
    if (headerMatch && footerMatch) {
      const header = headerMatch[0];
      const footer = footerMatch[0];
      const body = formattedKey.replace(header, "").replace(footer, "").trim();
      const formattedBody = body.match(/.{1,64}/g).join("\n");
      formattedKey = `${header}\n${formattedBody}\n${footer}`;
    }
  }

  return formattedKey;
}

function getPluginName() {
  return String(process.env.KOKO_PLUGIN_NAME).trim();
}

function getPluginVersion() {
  return String(process.env.KOKO_PLUGIN_VERSION).trim();
}

function getKokoBaseUrl() {
  const fromEnv = String(process.env.KOKO_BASE_URL || "").trim();
  if (fromEnv) {
    console.log(
      `🔧 Koko: Using explicit base URL from KOKO_BASE_URL: ${fromEnv}`,
    );
    return fromEnv.replace(/\/$/, "");
  }
  const env =
    process.env.NODE_ENV === "production" ? "production" : "development";
  const urls = {
    production: "https://prodapi.paykoko.com",
    development: "https://devapi.paykoko.com",
    qa: "https://qaapi.paykoko.com",
  };
  const url = urls[env] || urls.development;
  console.log(`🔧 Koko: Using base URL for ${env}: ${url}`);
  return url;
}

function getPublicApiBase(req) {
  const fromEnv = String(process.env.API_PUBLIC_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (!req) return "";
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!host) return "";
  return `${proto}://${host}`;
}

function getCallbackUrls(req, orderId) {
  const publicBase = getPublicApiBase(req);

  // Frontend redirect URLs (user-facing)
  const returnUrl =
    String(process.env.KOKO_RETURN_URL || "").trim() ||
    (publicBase ? `${publicBase}/api/v1/payment/koko/return` : "");
  const cancelUrl =
    String(process.env.KOKO_CANCEL_URL || "").trim() ||
    (publicBase ? `${publicBase}/api/v1/payment/koko/cancel` : "");

  // Backend callback URL (server-to-server)
  const responseUrl =
    String(process.env.KOKO_RESPONSE_URL || "").trim() ||
    (publicBase ? `${publicBase}/api/v1/payment/koko/response` : "");

  return { returnUrl, cancelUrl, responseUrl };
}

function buildDataString(params) {
  const parts = [
    params.mId,
    params.amount,
    params.currency,
    params.pluginName,
    params.pluginVersion,
    params.returnUrl,
    params.cancelUrl,
    params.orderId,
    params.reference,
    params.firstName,
    params.lastName,
    params.email,
    params.description,
    params.apiKey,
    params.responseUrl,
  ];
  return parts.join("");
}

function signDataString(dataString, privateKey) {
  if (!privateKey) {
    throw new Error("Koko private key is not configured");
  }

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(dataString);
  sign.end();

  const signature = sign.sign(privateKey, "base64");
  return signature;
}

function verifyResponseSignature(responseData, kokoPublicKey) {
  if (!kokoPublicKey) {
    console.warn(
      "⚠️ Koko public key not configured, skipping signature verification",
    );
    return true; // Allow if not configured (dev only)
  }

  try {
    // Response data string: orderId + trnId + status
    const dataString = `${responseData.orderId}${responseData.trnId}${responseData.status}`;

    const signature = Buffer.from(responseData.signature, "base64");

    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(dataString);
    verify.end();

    const isValid = verify.verify(kokoPublicKey, signature);
    console.log(
      `🔧 Koko response signature verification: ${isValid ? "VALID" : "INVALID"}`,
    );
    return isValid;
  } catch (error) {
    console.error(
      "❌ Koko response signature verification error:",
      error.message,
    );
    return false;
  }
}

function buildCustomer(user, body = {}) {
  const shipping = body.shipping_address || body.delivery_address || {};

  // Get phone and normalize to Koko format (07XXXXXXXX)
  let phone = body.phone || shipping.phone || user?.phone || "";
  phone = toKokoFormat(phone) || "";

  return {
    firstName: toAsciiSafe(
      body.first_name || shipping.first_name || user?.fname,
      "Customer",
    ),
    lastName: toAsciiSafe(body.last_name || shipping.last_name || user?.lname),
    email: toAsciiSafe(body.email || shipping.email || user?.email),
    phone: phone,
  };
}

function getClientIp(req) {
  if (!req) return "127.0.0.1";
  return (
    req.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.get("x-real-ip") ||
    req.ip ||
    req.connection?.remoteAddress ||
    "127.0.0.1"
  );
}

async function createOrder({
  req,
  orderId,
  amount,
  user,
  body,
  items,
  description,
}) {
  const merchantId = getMerchantId();
  const apiKey = getApiKey();
  const privateKey = getPrivateKey();

  if (!merchantId || !apiKey || !privateKey) {
    return {
      error:
        "Koko merchant configuration is missing (KOKO_MID, KOKO_API_KEY, KOKO_PRIVATE_KEY)",
    };
  }

  const { returnUrl, cancelUrl, responseUrl } = getCallbackUrls(req, orderId);

  console.log(
    `🔧 Koko callback URLs - Return: ${returnUrl}, Cancel: ${cancelUrl}, Response: ${responseUrl}`,
  );

  if (!returnUrl || !cancelUrl || !responseUrl) {
    return {
      error:
        "Koko callback URLs are not configured. Set KOKO_RETURN_URL, KOKO_CANCEL_URL, KOKO_RESPONSE_URL or API_PUBLIC_URL.",
    };
  }

  const customer = buildCustomer(user, body);
  const pluginName = getPluginName();
  const pluginVersion = getPluginVersion();
  const currency = "LKR";
  const reference = orderId;
  const amountStr = Number(Number(amount).toFixed(2)).toFixed(2);

  // Build an ASCII-safe description from items (Koko rejects non-ASCII fields).
  const itemNames = items
    .map((item) => toAsciiSafe(item.product?.prod_name || item.name))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const fallbackDesc = itemNames
    ? `${items.length} product(s): ${itemNames}`
    : `${items.length} product(s) - Order ${orderId}`;
  const desc = (toAsciiSafe(description, fallbackDesc) || fallbackDesc).slice(
    0,
    255,
  );

  // Build data string for signing
  const dataStringParams = {
    mId: merchantId,
    amount: amountStr,
    currency,
    pluginName,
    pluginVersion,
    returnUrl,
    cancelUrl,
    orderId: String(orderId),
    reference,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    description: desc,
    apiKey,
    responseUrl,
  };

  const dataString = buildDataString(dataStringParams);
  console.log(`🔧 Koko data string: ${dataString}`);

  const signature = signDataString(dataString, privateKey);
  console.log(`🔧 Koko signature generated: ${signature.substring(0, 50)}...`);

  // Prepare form data
  const formData = {
    _mId: merchantId,
    api_key: apiKey,
    _returnUrl: returnUrl,
    _cancelUrl: cancelUrl,
    _responseUrl: responseUrl,
    _amount: amountStr,
    _currency: currency,
    _reference: reference,
    _orderId: String(orderId),
    _pluginName: pluginName,
    _pluginVersion: pluginVersion,
    _description: desc,
    _firstName: customer.firstName,
    _lastName: customer.lastName,
    _email: customer.email,
    _phone: customer.phone,
    dataString: dataString,
    signature: signature,
  };

  console.log(
    `🔧 Koko create order payload:`,
    Object.keys(formData).reduce((acc, key) => {
      acc[key] =
        key === "signature"
          ? formData[key].substring(0, 50) + "..."
          : formData[key];
      return acc;
    }, {}),
  );

  try {
    const requestBody = querystring.stringify(formData);
    console.log(`🔧 Koko create order FULL REQUEST:`);
    console.log(`   URL: ${getKokoBaseUrl()}/api/merchants/orderCreate`);
    console.log(`   Body: ${requestBody}`);
    console.log(`   Data String: ${dataString}`);
    console.log(`   Signature: ${signature.substring(0, 50)}...`);

    const response = await axios.post(
      `${getKokoBaseUrl()}/api/merchants/orderCreate`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 30000,
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
      },
    );

    console.log(`🔧 Koko create order response status:`, response.status);
    console.log(`🔧 Koko create order response headers:`, response.headers);
    console.log(`🔧 Koko create order response data:`, response.data);

    // Koko returns HTML form for redirect or JSON
    // Based on docs, it seems to return a redirect URL or form
    let redirectUrl = null;

    // Check for redirect location header (302)
    if (response.headers.location) {
      redirectUrl = response.headers.location;
      console.log(`🔧 Koko redirect location: ${redirectUrl}`);
    }

    if (!redirectUrl && response.data && typeof response.data === "string") {
      // HTML response - extract redirect URL or form action
      const formActionMatch = response.data.match(/action=["']([^"']+)["']/i);
      if (formActionMatch) {
        redirectUrl = formActionMatch[1];
      }
    } else if (response.data && response.data.redirectUrl) {
      redirectUrl = response.data.redirectUrl;
    } else if (response.request?.res?.responseUrl) {
      redirectUrl = response.request.res.responseUrl;
    }

    if (!redirectUrl) {
      // Default Koko payment page
      const baseUrl = getKokoBaseUrl().replace("/api/merchants", "");
      redirectUrl = `${baseUrl}/pay/${orderId}`; // Adjust based on actual Koko flow
    }

    console.log(`✅ Koko order created: ${orderId}, redirect: ${redirectUrl}`);

    return {
      order_id: orderId,
      redirect_url: redirectUrl,
      amount: amountStr,
      currency,
      merchant_id: merchantId,
      trnId: null, // Will be available after payment
    };
  } catch (error) {
    if (error.response) {
      console.error(
        `❌ Koko create order failed (${error.response.status}):`,
        error.response.data,
      );

      const errorData = error.response.data;
      let errorMessage = `Koko create order failed (${error.response.status})`;

      if (errorData && typeof errorData === "object") {
        if (errorData.status && errorData.statusCode) {
          errorMessage += `: ${errorData.status} (${errorData.statusCode})`;
        }
        errorMessage += `: ${JSON.stringify(errorData)}`;
      } else {
        errorMessage += `: ${JSON.stringify(errorData)}`;
      }

      throw new Error(errorMessage);
    } else if (error.request) {
      console.error("❌ Koko create order - no response:", error.message);
      throw new Error(
        `Koko request timeout or network error: ${error.message}`,
      );
    } else {
      console.error("❌ Koko create order setup error:", error.message);
      throw new Error(`Koko request error: ${error.message}`);
    }
  }
}

async function getOrderStatus(orderId) {
  const merchantId = getMerchantId();
  const apiKey = getApiKey();
  const privateKey = getPrivateKey();

  if (!merchantId || !apiKey || !privateKey) {
    throw new Error("Koko merchant configuration is missing");
  }

  if (!orderId) return null;

  try {
    // Data string for orderView: MerchantID + PluginName + PluginVersion + OrderID + APIKey
    const dataString = `${merchantId}${getPluginName()}${getPluginVersion()}${orderId}${apiKey}`;
    const signature = signDataString(dataString, privateKey);

    const formData = {
      _mId: merchantId,
      _pluginName: getPluginName(),
      _pluginVersion: getPluginVersion(),
      api_key: apiKey,
      _orderId: String(orderId),
      signature: signature,
    };

    console.log(`🔧 Koko status check for order: ${orderId}`);

    const response = await axios.post(
      `${getKokoBaseUrl()}/api/merchants/orderView`,
      querystring.stringify(formData),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 20000,
      },
    );

    console.log(`🔧 Koko status response:`, response.data);

    // Handle different response structures
    let data = response.data;
    if (data?.content) {
      // QA/Prod response wraps data in content object
      data = data.content;
    }

    if (!data || !data.orderId) {
      return {
        verified: false,
        status: "unknown",
        rawStatus: data?.message || data?.status || "No data",
        orderId,
      };
    }

    // Verify response signature
    const isValidSignature = verifyResponseSignature(data, getKokoPublicKey());

    const statusMap = {
      SUCCESS: "success",
      FAILED: "failed",
      FAILURE: "failed",
      PENDING: "pending",
      CANCELED: "canceled",
    };

    const normalizedStatus =
      statusMap[data.status?.toUpperCase()] ||
      data.status?.toLowerCase() ||
      "unknown";

    return {
      verified: true,
      status: normalizedStatus,
      rawStatus: data.status,
      orderId: data.orderId,
      trnId: data.trnId,
      signatureValid: isValidSignature,
    };
  } catch (error) {
    if (error.response) {
      console.error(
        `❌ Koko status check failed (${error.response.status}):`,
        error.response.data,
      );
    } else {
      console.error("❌ Koko status check error:", error.message);
    }
    return {
      verified: false,
      status: "unknown",
      rawStatus: null,
      orderId,
    };
  }
}

function parseCallbackBody(body) {
  // Koko sends application/x-www-form-urlencoded
  return {
    orderId: body.orderId || body._orderId || null,
    trnId: body.trnId || null,
    status: body.status || null,
    desc: body.desc || null,
    signature: body.signature || null,
    raw: body,
  };
}

module.exports = {
  createOrder,
  getOrderStatus,
  parseCallbackBody,
  verifyResponseSignature,
  getMerchantId,
  getKokoBaseUrl,
};
