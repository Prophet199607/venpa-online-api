const crypto = require("crypto");
const axios = require("axios");

const SUCCESS_STATUSES = new Set([
  "success",
  "successful",
  "completed",
  "paid",
  "approved",
  "2",
]);
const FAILED_STATUSES = new Set([
  "failed",
  "fail",
  "rejected",
  "declined",
  "-2",
]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled", "-1"]);

let cachedToken = null;
let tokenExpiresAt = 0;

function getMerchantId() {
  return String(process.env.MINTPAY_MID || "").trim();
}

function getMerchantSecret() {
  return String(process.env.MINTPAY_SECRET || "").trim();
}

function getMintpayBaseUrl() {
  const fromEnv = String(process.env.MINTPAY_BASE_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return process.env.NODE_ENV === "production"
    ? "https://app.mintpay.lk"
    : "https://dev.mintpay.lk";
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

function withOrderId(url, orderId) {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}order_id=${encodeURIComponent(orderId)}`;
}

function getCallbackUrls(req, orderId) {
  const publicBase = getPublicApiBase(req);
  const successUrl = withOrderId(
    String(process.env.MINTPAY_SUCCESS_URL || "").trim() ||
      (publicBase ? `${publicBase}/api/v1/payment/mintpay/success` : ""),
    orderId,
  );
  const failUrl = withOrderId(
    String(process.env.MINTPAY_FAIL_URL || "").trim() ||
      (publicBase ? `${publicBase}/api/v1/payment/mintpay/failed` : ""),
    orderId,
  );

  return { successUrl, failUrl };
}

function unwrapData(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (payload.data && typeof payload.data === "object") return payload.data;
  return payload;
}

function normalizeStatus(status) {
  if (status === undefined || status === null) return "";
  return String(status).trim().toLowerCase();
}

function classifyStatus(status) {
  const normalized = normalizeStatus(status);
  if (SUCCESS_STATUSES.has(normalized)) return "success";
  if (CANCELED_STATUSES.has(normalized)) return "canceled";
  if (FAILED_STATUSES.has(normalized)) return "failed";
  if (normalized === "pending") return "pending";
  return "";
}

function buildCustomer(user, body = {}) {
  const shipping = body.shipping_address || body.delivery_address || {};
  const firstName =
    body.first_name ||
    shipping.first_name ||
    user?.fname ||
    "Customer";
  const lastName = body.last_name || shipping.last_name || user?.lname || "";
  const email = body.email || shipping.email || user?.email || "";
  const phone = String(body.phone || shipping.phone || user?.phone || "").replace(
    /\s+/g,
    "",
  );
  const deliveryAddress =
    body.address ||
    shipping.address ||
    [user?.address, user?.city].filter(Boolean).join(", ") ||
    "";

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    delivery_address: deliveryAddress,
  };
}

async function getAccessToken() {
  const merchantId = getMerchantId();
  const secret = getMerchantSecret();
  if (!merchantId || !secret) {
    throw new Error("Mintpay merchant configuration is missing");
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const { data, status } = await axios.post(
    `${getMintpayBaseUrl()}/user-api/v1.0/get-access-token`,
    { merchant_id: merchantId, secret },
    { headers: { "Content-Type": "application/json" }, timeout: 20000 },
  );

  const payload = unwrapData(data);
  const token = payload.access_token || payload.token || data?.access_token;
  if (!token) {
    throw new Error(
      `Mintpay access token request failed (${status}): ${JSON.stringify(data)}`,
    );
  }

  const expiresIn = Number(payload.expires_in || 3600);
  cachedToken = token;
  tokenExpiresAt = Date.now() + expiresIn * 1000;
  return token;
}

async function mintpayRequest(method, path, body) {
  const token = await getAccessToken();
  try {
    const response = await axios({
      method,
      url: `${getMintpayBaseUrl()}${path}`,
      data: body,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });
    return unwrapData(response.data);
  } catch (error) {
    if (error.response?.status === 401) {
      cachedToken = null;
      tokenExpiresAt = 0;
      const retryToken = await getAccessToken();
      const retry = await axios({
        method,
        url: `${getMintpayBaseUrl()}${path}`,
        data: body,
        headers: {
          Authorization: `Bearer ${retryToken}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      });
      return unwrapData(retry.data);
    }
    const details = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    throw new Error(`Mintpay request failed: ${details}`);
  }
}

function mapItems(items = []) {
  return items
    .map((item) => {
      const product = item.product || {};
      const name = product.prod_name || item.prod_name || item.name || "Item";
      const productCode =
        product.prod_code || item.prod_code || item.product_code || "N/A";
      const price = Number(
        product.selling_price || item.selling_price || item.price || 0,
      );
      const quantity = Number(item.quantity || item.picked_qty || 1);
      return {
        name,
        product_code: productCode,
        price: Number(price.toFixed(2)),
        quantity,
      };
    })
    .filter((item) => item.quantity > 0);
}

async function createPurchase({
  req,
  orderId,
  amount,
  user,
  body,
  items,
}) {
  const merchantId = getMerchantId();
  const secret = getMerchantSecret();
  if (!merchantId || !secret) {
    return { error: "Mintpay merchant configuration is missing" };
  }

  const { successUrl, failUrl } = getCallbackUrls(req, orderId);
  if (!successUrl || !failUrl) {
    return {
      error:
        "Mintpay callback URLs are not configured. Set API_PUBLIC_URL or MINTPAY_SUCCESS_URL and MINTPAY_FAIL_URL.",
    };
  }

  const totalAmount = Number(Number(amount).toFixed(2));
  const payload = {
    merchant_id: merchantId,
    order_id: String(orderId),
    currency: "LKR",
    total_amount: totalAmount,
    success_url: successUrl,
    fail_url: failUrl,
    customer: buildCustomer(user, body),
    purchased_items: mapItems(items),
  };

  const data = await mintpayRequest("post", "/user-api/v1.0/purchases", payload);
  const purchaseId = data.purchase_id || data.purchaseId || data.id;
  const redirectUrl =
    data.redirect_url || data.redirectUrl || data.checkout_url || data.url;

  if (!redirectUrl) {
    return {
      error: `Mintpay did not return a redirect URL: ${JSON.stringify(data)}`,
    };
  }

  return {
    purchase_id: purchaseId || null,
    redirect_url: redirectUrl,
    amount: totalAmount.toFixed(2),
    currency: "LKR",
    merchant_id: merchantId,
  };
}

async function getPurchase(purchaseId) {
  if (!purchaseId) return null;
  return mintpayRequest(
    "get",
    `/user-api/v1.0/purchases/${encodeURIComponent(purchaseId)}`,
  );
}

function verifyIpnHash({
  purchase_id,
  order_id,
  status,
  total_amount,
  hash,
}) {
  if (!hash) return false;
  const secret = getMerchantSecret();
  if (!secret) return false;

  const amount = String(total_amount ?? "");
  const purchaseId = String(purchase_id ?? "");
  const orderId = String(order_id ?? "");
  const paymentStatus = String(status ?? "");
  const incoming = String(hash).trim().toLowerCase();

  const candidates = [
    crypto
      .createHmac("sha256", secret)
      .update(`${purchaseId}${orderId}${paymentStatus}${amount}`)
      .digest("hex"),
    crypto
      .createHmac("sha256", secret)
      .update(`${orderId}${purchaseId}${paymentStatus}${amount}`)
      .digest("hex"),
    crypto
      .createHash("sha256")
      .update(`${purchaseId}${orderId}${paymentStatus}${secret}`)
      .digest("hex"),
    crypto
      .createHash("sha256")
      .update(`${getMerchantId()}${orderId}${amount}${secret}`)
      .digest("hex"),
  ];

  return candidates.some((value) => value.toLowerCase() === incoming);
}

function extractCallbackFields(req) {
  const source = { ...(req.query || {}), ...(req.body || {}) };
  return {
    order_id:
      source.order_id ||
      source.orderId ||
      source.merchant_order_id ||
      source.merchantOrderId ||
      null,
    purchase_id:
      source.purchase_id || source.purchaseId || source.id || null,
    status: source.status || source.payment_status || source.state || null,
    total_amount:
      source.total_amount || source.amount || source.payhere_amount || null,
    hash: source.hash || source.signature || source.checksum || null,
    raw: source,
  };
}

module.exports = {
  createPurchase,
  getPurchase,
  verifyIpnHash,
  classifyStatus,
  extractCallbackFields,
  getMerchantId,
};
