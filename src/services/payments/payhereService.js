const crypto = require("crypto");
const axios = require("axios");

let cachedToken = null;
let tokenExpiresAt = 0;

function normalizeValue(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function formatAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "0.00";
  return numeric.toFixed(2);
}

function amountsMatch(expected, actual) {
  const left = Number(expected);
  const right = Number(actual);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) < 0.009;
}

function getMerchantId() {
  return normalizeValue(process.env.PAYHERE_MERCHANT_ID);
}

function getMerchantSecret() {
  return normalizeValue(process.env.PAYHERE_MERCHANT_SECRET);
}

function getCurrency() {
  return normalizeValue(process.env.PAYHERE_CURRENCY) || "LKR";
}

function getMerchantApiBase() {
  const configured = normalizeValue(process.env.PAYHERE_MERCHANT_API_URL).replace(
    /\/$/,
    "",
  );
  if (configured) return configured;
  return "https://www.payhere.lk";
}

function getPublicApiBase(req) {
  const configuredBase = normalizeValue(process.env.API_PUBLIC_URL).replace(
    /\/$/,
    "",
  );
  if (configuredBase) return configuredBase;

  const legacyBase = normalizeValue(process.env.PAYHERE_API_BASE_URL).replace(
    /\/$/,
    "",
  );
  if (legacyBase && !legacyBase.includes("payhere.lk")) return legacyBase;
  if (!req) return "";

  const defaultProtocol =
    process.env.NODE_ENV === "production" ? "https" : req.protocol || "http";
  const forwardedProto = req.get?.("x-forwarded-proto") || defaultProtocol;
  const protocol = String(forwardedProto).split(",")[0].trim();
  const host =
    req.get?.("x-forwarded-host") || req.get?.("host") || req.headers?.host;
  return host ? `${protocol}://${host}` : "";
}

function getCallbackUrls(req) {
  const publicBase = getPublicApiBase(req);
  const notifyUrl =
    normalizeValue(process.env.PAYHERE_NOTIFY_URL) ||
    (publicBase ? `${publicBase}/api/v1/payment/payhere/notify` : "");
  const returnUrl =
    normalizeValue(process.env.PAYHERE_RETURN_URL) ||
    (publicBase ? `${publicBase}/api/v1/payment/payhere/return` : "");
  const cancelUrl =
    normalizeValue(process.env.PAYHERE_CANCEL_URL) ||
    (publicBase ? `${publicBase}/api/v1/payment/payhere/cancel` : "");

  return {
    notify_url: notifyUrl,
    return_url: returnUrl,
    cancel_url: cancelUrl,
  };
}

function md5Upper(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex").toUpperCase();
}

function signaturesMatch(left, right) {
  const a = Buffer.from(normalizeValue(left).toUpperCase(), "utf8");
  const b = Buffer.from(normalizeValue(right).toUpperCase(), "utf8");
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function buildCheckoutHash(orderId, amount) {
  const merchantId = getMerchantId();
  const merchantSecret = getMerchantSecret();
  const currency = getCurrency();
  const formattedAmount = formatAmount(amount);
  const orderRef = normalizeValue(orderId);

  if (!merchantId || !merchantSecret) {
    return { error: "PayHere merchant configuration is missing" };
  }
  if (!orderRef) {
    return { error: "PayHere order_id is required" };
  }

  const hash = md5Upper(
    `${merchantId}${orderRef}${formattedAmount}${currency}${md5Upper(merchantSecret)}`,
  );

  return {
    merchant_id: merchantId,
    order_id: orderRef,
    amount: formattedAmount,
    currency,
    hash,
  };
}

function buildCheckoutParams({ orderId, amount, items, customer = {}, req = null }) {
  const hashed = buildCheckoutHash(orderId, amount);
  if (hashed.error) return hashed;

  const callbackUrls = getCallbackUrls(req);
  if (!callbackUrls.notify_url) {
    return {
      error:
        "PayHere notify URL is not configured. Set API_PUBLIC_URL or PAYHERE_NOTIFY_URL.",
    };
  }
  if (!callbackUrls.return_url || !callbackUrls.cancel_url) {
    return {
      error:
        "PayHere return_url and cancel_url are required. Set API_PUBLIC_URL or PAYHERE_RETURN_URL / PAYHERE_CANCEL_URL.",
    };
  }

  const itemSummary =
    normalizeValue(items) || `Venpaa order ${hashed.order_id}`;

  return {
    merchant_id: hashed.merchant_id,
    return_url: callbackUrls.return_url,
    cancel_url: callbackUrls.cancel_url,
    notify_url: callbackUrls.notify_url,
    order_id: hashed.order_id,
    items: itemSummary,
    currency: hashed.currency,
    amount: hashed.amount,
    first_name: normalizeValue(customer.first_name) || "Customer",
    last_name: normalizeValue(customer.last_name) || "Customer",
    email: normalizeValue(customer.email),
    phone: normalizeValue(customer.phone),
    address: normalizeValue(customer.address) || "Sri Lanka",
    city: normalizeValue(customer.city) || "Colombo",
    country: normalizeValue(customer.country) || "Sri Lanka",
    hash: hashed.hash,
  };
}

function buildCustomer(user, body = {}) {
  const shipping = body.shipping_address || body.delivery_address || {};
  return {
    first_name:
      body.first_name || shipping.first_name || user?.fname || "Customer",
    last_name: body.last_name || shipping.last_name || user?.lname || "",
    email: body.email || shipping.email || user?.email || "",
    phone: String(body.phone || shipping.phone || user?.phone || "").replace(
      /\s+/g,
      "",
    ),
    address:
      body.address ||
      shipping.address ||
      [user?.address, user?.city].filter(Boolean).join(", ") ||
      "",
    city: body.city || shipping.city || user?.city || "Colombo",
    country: body.country || shipping.country || "Sri Lanka",
  };
}

function verifyNotifySignature({
  merchant_id,
  order_id,
  payhere_amount,
  payhere_currency,
  status_code,
  md5sig,
}) {
  const merchantId = getMerchantId();
  const merchantSecret = getMerchantSecret();
  const signature = normalizeValue(md5sig).toUpperCase();
  if (!signature || !merchantId || !merchantSecret) return false;
  if (normalizeValue(merchant_id) !== merchantId) return false;

  const localMd5sig = md5Upper(
    [
      merchant_id,
      order_id,
      payhere_amount,
      payhere_currency,
      status_code,
    ]
      .map(normalizeValue)
      .join("") + md5Upper(merchantSecret),
  );

  return signaturesMatch(localMd5sig, signature);
}

function classifyNotifyStatus(statusCode) {
  const code = normalizeValue(statusCode);
  if (code === "2") return "success";
  if (code === "0") return "pending";
  if (code === "-1") return "canceled";
  if (code === "-2") return "failed";
  if (code === "-3") return "chargedback";
  return "failed";
}

function classifyMerchantStatus(status) {
  const normalized = normalizeValue(status).toUpperCase();
  if (normalized === "RECEIVED") return "success";
  if (normalized === "CHARGEBACKED") return "chargedback";
  if (normalized === "REFUNDED") return "refunded";
  if (normalized === "HOLD" || normalized === "REFUND REQUESTED") return "pending";
  return "pending";
}

function pickBestPayment(payments = []) {
  if (!Array.isArray(payments) || !payments.length) return null;
  const ranked = [...payments].sort((a, b) => {
    const rank = (status) =>
      classifyMerchantStatus(status) === "success" ? 2 : 1;
    const byStatus = rank(b?.status) - rank(a?.status);
    if (byStatus !== 0) return byStatus;
    return new Date(b?.date || 0) - new Date(a?.date || 0);
  });
  return ranked[0];
}

async function getAccessToken() {
  const appId = normalizeValue(process.env.PAYHERE_APP_ID);
  const appSecret = normalizeValue(process.env.PAYHERE_APP_SECRET);
  if (!appId || !appSecret) {
    throw new Error(
      "PayHere Retrieval API is not configured. Set PAYHERE_APP_ID and PAYHERE_APP_SECRET.",
    );
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const { data, status } = await axios.post(
    `${getMerchantApiBase()}/merchant/v1/oauth/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 20000,
    },
  );

  const token = data?.access_token;
  if (!token) {
    throw new Error(
      `PayHere OAuth token request failed (${status}): ${JSON.stringify(data)}`,
    );
  }

  const expiresIn = Number(data.expires_in || 599);
  cachedToken = token;
  tokenExpiresAt = Date.now() + expiresIn * 1000;
  return cachedToken;
}

async function searchPaymentsByOrderId(orderId) {
  const orderRef = normalizeValue(orderId);
  if (!orderRef) {
    return { payments: [], raw: null };
  }

  const requestSearch = async (token) =>
    axios.get(`${getMerchantApiBase()}/merchant/v1/payment/search`, {
      params: { order_id: orderRef },
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });

  let token = await getAccessToken();
  let response;
  try {
    response = await requestSearch(token);
  } catch (error) {
    if (error.response?.status === 401) {
      cachedToken = null;
      tokenExpiresAt = 0;
      token = await getAccessToken();
      response = await requestSearch(token);
    } else {
      throw error;
    }
  }

  const payload = response.data || {};
  const payments = Array.isArray(payload.data) ? payload.data : [];
  return { payments, raw: payload };
}

module.exports = {
  normalizeValue,
  formatAmount,
  amountsMatch,
  getMerchantId,
  getCurrency,
  getCallbackUrls,
  buildCheckoutParams,
  buildCustomer,
  verifyNotifySignature,
  classifyNotifyStatus,
  classifyMerchantStatus,
  pickBestPayment,
  searchPaymentsByOrderId,
};
