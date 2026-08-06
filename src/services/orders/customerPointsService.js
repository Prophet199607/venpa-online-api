const axios = require("axios");

const CRM_BASE = "https://crmapi.venpaa.lk";
const AUTH_STRING = Buffer.from("onimta:2302").toString("base64");

function normalizeMobile(mobile) {
  if (!mobile) return "";
  let digits = String(mobile).replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    digits = "94" + digits.slice(1);
  } else if (digits.length === 9) {
    digits = "94" + digits;
  }
  return digits;
}

// GET /crm/customers/pos — look up an existing customer by phone
async function lookupCustCode(mobile) {
  const normalized = normalizeMobile(mobile);
  if (!normalized) return null;
  try {
    const response = await axios.get(`${CRM_BASE}/crm/customers/pos`, {
      params: { value: normalized, loca: "03" },
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${AUTH_STRING}`,
      },
      validateStatus: () => true,
    });
    const crmData = response.data;
    const item = Array.isArray(crmData)
      ? crmData[0]
      : Array.isArray(crmData.data)
        ? crmData.data[0]
        : crmData.data || crmData;
    const code =
      item?.Cus_Code || item?.cus_code || item?.CUS_CODE || null;
    console.log(
      `[CustomerPoints] CRM lookup for ${normalized}: HTTP ${response.status}, code=${code}`,
    );
    return code;
  } catch (err) {
    console.warn(
      `[CustomerPoints] CRM lookup error for mobile ${mobile}:`,
      err.message,
    );
    return null;
  }
}

function toDate(date) {
  if (!date) return new Date();
  if (date instanceof Date && !isNaN(date)) return date;
  const str = String(date);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (match) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s);
  }
  const parsed = new Date(str);
  return isNaN(parsed) ? new Date() : parsed;
}

function formatDate(date) {
  const d = toDate(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(date) {
  const d = toDate(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function resolveAmount(order) {
  let amount = 0;
  if (typeof order.payload !== "undefined") {
    let payload = order.payload || {};
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = {};
      }
    }
    const totals = payload.totals || {};
    amount = parseFloat(
      totals.netTotalWithCod ||
        totals.netTotalWithoutCod ||
        totals.subTotal ||
        0,
    );
  } else {
    amount = parseFloat(order.net_amount || 0);
  }
  return isNaN(amount) ? 0 : amount;
}

// action: "earn" (on confirm) or "redeem" (on cancel/return)
// Earn  → POST /crm/EarnCustomerPoints
// Redeem → POST /crm/RedeamCustomerPoints
async function syncCustomerPoints({ order, user, orderId, action }) {
  const endpoint =
    action === "redeem"
      ? `${CRM_BASE}/crm/RedeamCustomerPoints`
      : `${CRM_BASE}/crm/EarnCustomerPoints`;

  // 1. Try stored code on the user object
  let resolvedCode = (user && (user.crm_cus_code || user.cus_code)) || null;

  // 2. Look up by phone in CRM
  if (!resolvedCode && user && user.phone) {
    resolvedCode = await lookupCustCode(user.phone);
  }

  console.log(
    `[CustomerPoints] Resolved custCode for order ${orderId}: ${resolvedCode}`,
  );

  // 3. If still no code, skip gracefully
  if (!resolvedCode) {
    console.warn(
      `[CustomerPoints] Skipping ${action} for order ${orderId} — custCode could not be resolved (user: ${user?.id}, phone: ${user?.phone})`,
    );
    return {
      action,
      orderId,
      httpStatus: null,
      success: false,
      skipped: true,
      reason: "custCode could not be resolved",
    };
  }

  const billAmount = resolveAmount(order);
  const postDate = formatDate(order.created_at);
  const billDate = formatDate(order.updated_at || order.created_at);
  const billTime = formatTime(order.updated_at || order.created_at);

  const crmPayload = {
    billAmount,
    billDate,
    billTime,
    custCode: resolvedCode,
    postDate,
    receiptNo: String(orderId),
    user: "SYNC_ADMIN",
  };

  // Redeem endpoint additionally requires the amount being redeemed
  if (action === "redeem") {
    crmPayload.redeamAmount = billAmount;
  }

  console.log("[CustomerPoints] Sending payload:", JSON.stringify(crmPayload));

  const response = await axios.post(endpoint, crmPayload, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${AUTH_STRING}`,
    },
    validateStatus: () => true,
  });

  const body =
    response.data || (typeof response.data === "string" ? response.data : {});
  const httpOk = response.status >= 200 && response.status < 300;
  const bodyOk = body.success === true || body.success === undefined;

  console.log(
    `[CustomerPoints] ${action} response status=${response.status}:`,
    JSON.stringify(body),
  );

  return {
    action,
    orderId,
    httpStatus: response.status,
    success: httpOk && bodyOk,
    data: body,
  };
}

module.exports = { syncCustomerPoints };
