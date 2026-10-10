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

function getMerchantId() {
  return String(process.env.MINTPAY_MID || "").trim();
}

function getMerchantToken() {
  return String(process.env.MINTPAY_TOKEN || "").trim();
}

function getMintpayBaseUrl() {
  const fromEnv = String(process.env.MINTPAY_BASE_URL || "").trim();
  if (fromEnv) {
    console.log(
      `🔧 Mintpay: Using explicit base URL from MINTPAY_BASE_URL: ${fromEnv}`,
    );
    return fromEnv.replace(/\/$/, "");
  }
  const url =
    process.env.NODE_ENV === "production"
      ? "https://app.mintpay.lk/user-order/api"
      : "https://dev.mintpay.lk/user-order/api";
  console.log(
    `🔧 Mintpay: Using base URL based on NODE_ENV (${process.env.NODE_ENV}): ${url}`,
  );
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
    body.first_name || shipping.first_name || user?.fname || "Customer";
  const lastName = body.last_name || shipping.last_name || user?.lname || "";
  const email = body.email || shipping.email || user?.email || "";
  const phone = String(
    body.phone || shipping.phone || user?.phone || "",
  ).replace(/\s+/g, "");
  const deliveryAddress =
    body.address ||
    shipping.address ||
    [user?.address, user?.city].filter(Boolean).join(", ") ||
    "";
  const deliveryRegion = body.city || shipping.city || user?.city || "";
  const deliveryPostcode = body.postcode || shipping.postcode || "";

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    delivery_street: deliveryAddress,
    delivery_region: deliveryRegion,
    delivery_postcode: deliveryPostcode,
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
      const discount = Number(item.discount || 0);
      return {
        name,
        product_id: productCode,
        sku: item.sku || "default",
        quantity,
        unit_price: Number(price.toFixed(4)),
        discount: Number(discount.toFixed(4)),
        created_date: new Date().toISOString().slice(0, 19).replace("T", " "),
        updated_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      };
    })
    .filter((item) => item.quantity > 0);
}

async function createPurchase({ req, orderId, amount, user, body, items }) {
  const merchantId = getMerchantId();
  const token = getMerchantToken();

  if (!merchantId || !token) {
    return {
      error:
        "Mintpay merchant configuration is missing (MINTPAY_MID or MINTPAY_TOKEN)",
    };
  }

  const { successUrl, failUrl } = getCallbackUrls(req, orderId);
  console.log(
    `🔧 Mintpay callback URLs - Success: ${successUrl}, Fail: ${failUrl}`,
  );
  if (!successUrl || !failUrl) {
    return {
      error:
        "Mintpay callback URLs are not configured. Set API_PUBLIC_URL or MINTPAY_SUCCESS_URL and MINTPAY_FAIL_URL.",
    };
  }

  const customer = buildCustomer(user, body);
  const clientIp = getClientIp(req);
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const payload = {
    merchant_id: merchantId,
    order_id: String(orderId),
    total_price: Number(Number(amount).toFixed(4)),
    discount: "0.0000",
    customer_email: customer.email,
    customer_id: String(user?.id || ""),
    customer_telephone: customer.phone,
    ip: clientIp,
    x_forwarded_for: req?.get("x-forwarded-for") || clientIp,
    delivery_street: customer.delivery_street,
    delivery_region: customer.delivery_region,
    delivery_postcode: customer.delivery_postcode,
    cart_created_date: now,
    cart_updated_date: now,
    success_url: successUrl,
    fail_url: failUrl,
    products: mapItems(items),
  };

  console.log(`🔧 Mintpay purchase payload:`, JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(`${getMintpayBaseUrl()}/`, payload, {
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });

    console.log(
      `🔧 Mintpay create purchase response:`,
      JSON.stringify(response.data, null, 2),
    );

    const data = unwrapData(response.data);

    if (response.data?.message !== "Success" || !data) {
      return {
        error: `Mintpay create purchase failed: ${response.data?.message || "Unknown error"} - ${JSON.stringify(response.data)}`,
      };
    }

    const purchaseId = String(data);
    const baseUrl = getMintpayBaseUrl().replace("/user-order/api", "");
    const paymentUrl = `${baseUrl}/user-order/login/`;

    console.log(
      `✅ Mintpay purchase created: ${purchaseId}, payment URL: ${paymentUrl}`,
    );

    return {
      purchase_id: purchaseId,
      redirect_url: paymentUrl,
      amount: Number(amount).toFixed(2),
      currency: "LKR",
      merchant_id: merchantId,
    };
  } catch (error) {
    if (error.response) {
      console.error(
        `❌ Mintpay create purchase failed (${error.response.status}):`,
        JSON.stringify(error.response.data),
      );
      throw new Error(
        `Mintpay create purchase failed (${error.response.status}): ${JSON.stringify(error.response.data)}`,
      );
    } else if (error.request) {
      console.error(
        "❌ Mintpay create purchase - no response received:",
        error.message,
      );
      throw new Error(
        `Mintpay request timeout or network error: ${error.message}`,
      );
    } else {
      console.error("❌ Mintpay create purchase setup error:", error.message);
      throw new Error(`Mintpay request error: ${error.message}`);
    }
  }
}

async function getPurchaseStatus(purchaseId) {
  const merchantId = getMerchantId();
  const token = getMerchantToken();

  if (!merchantId || !token) {
    throw new Error("Mintpay merchant configuration is missing");
  }

  if (!purchaseId) return null;

  try {
    const baseUrl = getMintpayBaseUrl().replace("/user-order/api", "");
    const statusUrl = `${baseUrl}/user-order/api/status/merchantId/${merchantId}/purchaseId/${purchaseId}`;

    console.log(`🔧 Mintpay status check URL: ${statusUrl}`);

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });

    console.log(
      `🔧 Mintpay status response:`,
      JSON.stringify(response.data, null, 2),
    );

    const data = unwrapData(response.data);

    if (response.data?.message !== "Success" || !data) {
      return {
        verified: false,
        status: "unknown",
        rawStatus: response.data?.message || "Unknown",
        purchaseId,
      };
    }

    return {
      verified: true,
      status: classifyStatus(data.status),
      rawStatus: data.status,
      purchaseId,
      orderId: data.order_id,
      totalPrice: data.total_price,
      channel: data.channel,
      createdAt: data.created_at,
    };
  } catch (error) {
    if (error.response) {
      console.error(
        `❌ Mintpay status check failed (${error.response.status}):`,
        JSON.stringify(error.response.data),
      );
    } else {
      console.error("❌ Mintpay status check error:", error.message);
    }
    return {
      verified: false,
      status: "unknown",
      rawStatus: null,
      purchaseId,
    };
  }
}

function verifyCallbackHash({
  order_id,
  purchase_id,
  status,
  total_amount,
  hash,
}) {
  // The documented API doesn't specify a hash verification for callbacks
  // Payment status should be verified via the status check API
  return true;
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
    purchase_id: source.purchase_id || source.purchaseId || source.id || null,
    status: source.status || source.payment_status || source.state || null,
    total_amount:
      source.total_amount || source.amount || source.payhere_amount || null,
    hash: source.hash || source.signature || source.checksum || null,
    raw: source,
  };
}

module.exports = {
  createPurchase,
  getPurchase: getPurchaseStatus,
  verifyIpnHash: verifyCallbackHash,
  classifyStatus,
  extractCallbackFields,
  getMerchantId,
};
