const axios = require("axios");
const sequelizeSource = require("../../config/sourceDb");

async function recordCodOrder({ order, user, device, orderId }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;
  const dateTimeStr = `${dateStr} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  const isWeb = device === "3" || device === 3;
  const iid = "CODO";
  const platformType = isWeb ? "WEB" : "APP";
  const docNo = `${orderId}`;

  let customerName = user
    ? `${user.fname || ""} ${user.lname || ""}`.trim() || "N/A"
    : "N/A";

  const isCheckout = typeof order.payload !== "undefined";

  let location, transactionAmount, courierCharges;

  if (isCheckout) {
    let payload = order.payload || {};
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = {};
      }
    }
    const totals = payload.totals || {};

    let rawLocation = payload.location || "001";
    if (typeof rawLocation === "string" && rawLocation.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(rawLocation);
        rawLocation =
          Array.isArray(parsed) && parsed.length > 0
            ? parsed[0].location || "001"
            : "001";
      } catch (e) {
        rawLocation = "001";
      }
    }
    location =
      typeof rawLocation === "string"
        ? rawLocation.substring(0, 20)
        : String(rawLocation).substring(0, 20);

    transactionAmount = parseFloat(
      totals.netTotalWithCod || totals.subTotal || 0,
    );
    // courierCharges = String(totals.courierCharge || 0);
  } else {
    let rawLocation = order.location || "001";
    if (typeof rawLocation === "string" && rawLocation.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(rawLocation);
        rawLocation =
          Array.isArray(parsed) && parsed.length > 0
            ? parsed[0].location || "001"
            : "001";
      } catch (e) {
        rawLocation = "001";
      }
    }
    location =
      typeof rawLocation === "string"
        ? rawLocation.substring(0, 20)
        : String(rawLocation).substring(0, 20);

    transactionAmount = parseFloat(order.net_amount || 0);
    courierCharges = "0";
  }

  if (isNaN(transactionAmount) || transactionAmount <= 0) {
    console.warn(
      `[CODManagement] Skipping: invalid transaction amount ${transactionAmount} for order ${orderId}`,
    );
    return;
  }

  await sequelizeSource.query(
    `INSERT INTO cod_management
      (customer, location, transaction_date, transaction_amount, doc_no, receipt_no, report_id, \`user\`, \`status\`, received_amount, refund_amount, courier_charges, \`type\`, created_at, updated_at)
     VALUES
      (:customer, :location, :transactionDate, :transactionAmount, :docNo, :receiptNo, :reportId, :user, :status, :receivedAmount, :refundAmount, :courierCharges, :type, :createdAt, :updatedAt)`,
    {
      replacements: {
        customer: customerName,
        location,
        transactionDate: dateTimeStr,
        transactionAmount,
        docNo,
        receiptNo: String(orderId),
        reportId: String(orderId),
        user: "customer",
        status: "pending",
        receivedAmount: "0",
        refundAmount: "0",
        courierCharges: "0",
        type: platformType,
        createdAt: dateTimeStr,
        updatedAt: dateTimeStr,
      },
      type: sequelizeSource.QueryTypes.INSERT,
    },
  );

  console.log(
    `[CODManagement] Inserted cod_management record for order ${orderId}`,
  );

  await sequelizeSource.query(
    `INSERT INTO payment_summaries
      (acc_type, iid, doc_no, ref_doc_no, transaction_amount, balance_amount, document_date, transaction_date, location, month_end, created_at, updated_at)
     VALUES
      (:accType, :iid, :docNo, :refDocNo, :transactionAmount, :balanceAmount, :documentDate, :transactionDate, :location, :monthEnd, :createdAt, :updatedAt)`,
    {
      replacements: {
        accType: "OnlineCustomer",
        iid,
        docNo,
        refDocNo: `${orderId}`,
        transactionAmount,
        balanceAmount: transactionAmount,
        documentDate: dateStr,
        transactionDate: dateStr,
        location,
        monthEnd: 0,
        createdAt: dateTimeStr,
        updatedAt: dateTimeStr,
      },
      type: sequelizeSource.QueryTypes.INSERT,
    },
  );

  console.log(
    `[CODManagement] Inserted payment_summaries record for order ${orderId}`,
  );
}

async function updatePaymentAccCode(mobile, orderId) {
  try {
    console.log(
      `[updatePaymentAccCode] Starting for order ${orderId}, raw mobile: "${mobile}"`,
    );

    let digits = String(mobile || "").replace(/\D/g, "");
    console.log(`[updatePaymentAccCode] After stripping non-digits: "${digits}"`);

    if (digits.startsWith("0") && digits.length === 10) {
      digits = "94" + digits.slice(1);
    } else if (digits.length === 9) {
      digits = "94" + digits;
    }
    const normalizedMobile = digits;
    console.log(`[updatePaymentAccCode] Normalized mobile: "${normalizedMobile}"`);

    if (!normalizedMobile) {
      console.warn(
        `[updatePaymentAccCode] Skipping: no valid mobile for order ${orderId}`,
      );
      return;
    }

    const authString = Buffer.from("onimta:2302").toString("base64");
    console.log(
      `[updatePaymentAccCode] Calling CRM GET with params: ${JSON.stringify({ mobile: normalizedMobile, loca: "03" })}`,
    );

    const crmResponse = await axios.get(
      "https://crmapi.venpaa.lk/crm/customers/pos",
      {
        params: { mobile: normalizedMobile, loca: "03" },
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${authString}`,
        },
        validateStatus: () => true,
      },
    );

    console.log(
      `[updatePaymentAccCode] CRM HTTP status: ${crmResponse.status}`,
    );

    const crmData = crmResponse.data;
    console.log(
      `[updatePaymentAccCode] CRM raw response body: ${JSON.stringify(crmData)}`,
    );
    console.log(
      `[updatePaymentAccCode] typeof crmData: ${typeof crmData}, isArray: ${Array.isArray(crmData)}`,
    );

    let cusCode = null;

    if (crmResponse.status >= 200 && crmResponse.status < 300 && crmData) {
      let item;
      if (Array.isArray(crmData)) {
        item = crmData[0];
        console.log(`[updatePaymentAccCode] Response is array, took first element`);
      } else if (Array.isArray(crmData.data)) {
        item = crmData.data[0];
        console.log(`[updatePaymentAccCode] Response.data is array, took first element`);
      } else if (crmData.data) {
        item = crmData.data;
        console.log(`[updatePaymentAccCode] Using crmData.data`);
      } else {
        item = crmData;
        console.log(`[updatePaymentAccCode] Using crmData directly`);
      }

      console.log(`[updatePaymentAccCode] Extracted item: ${JSON.stringify(item)}`);

      cusCode = item?.Cus_Code || item?.cus_code || item?.CUS_CODE || null;
      console.log(
        `[updatePaymentAccCode] Tried Cus_Code/cus_code/CUS_CODE on item, result: "${cusCode}"`,
      );

      // Also try on the top-level data if item didn't have it
      if (!cusCode) {
        cusCode = crmData.Cus_Code || crmData.cus_code || crmData.CUS_CODE || null;
        console.log(
          `[updatePaymentAccCode] Tried top-level crmData, result: "${cusCode}"`,
        );
      }
    } else {
      console.warn(
        `[updatePaymentAccCode] CRM returned non-success: HTTP ${crmResponse.status}`,
      );
    }

    if (!cusCode) {
      console.warn(
        `[updatePaymentAccCode] No Cus_Code found for mobile ${normalizedMobile} order ${orderId}`,
      );
      return;
    }

    console.log(
      `[updatePaymentAccCode] About to UPDATE payment_summaries SET acc_code='${cusCode}' WHERE doc_no='${orderId}'`,
    );

    const updateResult = await sequelizeSource.query(
      `UPDATE payment_summaries SET acc_code = :accCode, updated_at = :updatedAt WHERE doc_no = :docNo AND (acc_code IS NULL OR acc_code = '')`,
      {
        replacements: {
          accCode: cusCode,
          docNo: String(orderId),
          updatedAt: new Date()
            .toISOString()
            .slice(0, 19)
            .replace("T", " "),
        },
        type: sequelizeSource.QueryTypes.UPDATE,
      },
    );

    console.log(
      `[updatePaymentAccCode] UPDATE full result: ${JSON.stringify(updateResult)}`,
    );
  } catch (err) {
    console.warn(
      `[updatePaymentAccCode] Error for order ${orderId}:`,
      err.message,
      err.stack || "",
    );
  }
}

module.exports = { recordCodOrder, updatePaymentAccCode };
