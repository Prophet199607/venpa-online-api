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

  let cusCode = null;
  let crmDebug = { attempted: false, status: null, data: null, error: null };
  try {
    let mobile = user?.phone || "";
    if (mobile) {
      let digits = String(mobile).replace(/\D/g, "");
      if (digits.startsWith("0") && digits.length === 10) {
        digits = "94" + digits.slice(1);
      } else if (digits.length === 9) {
        digits = "94" + digits;
      }
      mobile = digits;
    }
    if (mobile) {
      crmDebug.attempted = true;
      crmDebug.mobile = mobile;
      const authString = Buffer.from("onimta:2302").toString("base64");
      const crmResponse = await axios.post(
        "https://crmapi.venpaa.lk/crm/customers/pos",
        { value: { mobile, loca: "03" } },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Basic ${authString}`,
          },
          validateStatus: () => true,
        },
      );
      crmDebug.status = crmResponse.status;
      const crmData = crmResponse.data;
      crmDebug.data = crmData;
      console.log(
        `[CODManagement] CRM GET response status=${crmResponse.status} mobile=${mobile}:`,
        JSON.stringify(crmData),
      );
      if (crmResponse.status >= 200 && crmResponse.status < 300 && crmData) {
        const item = Array.isArray(crmData)
          ? crmData[0]
          : Array.isArray(crmData.data)
            ? crmData.data[0]
            : crmData.data || crmData;
        cusCode = item?.Cus_Code || item?.cus_code || item?.CUS_CODE || null;
        if (cusCode) {
          console.log(
            `[CODManagement] Found Cus_Code for mobile ${mobile}: ${cusCode}`,
          );
        }
      } else {
        console.warn(
          `[CODManagement] CRM lookup failed for mobile ${mobile}: HTTP ${crmResponse.status}`,
          JSON.stringify(crmData),
        );
      }
    }
  } catch (err) {
    crmDebug.error = err.message;
    console.warn(
      `[CODManagement] CRM lookup error for order ${orderId}:`,
      err.message,
    );
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
      (acc_type, iid, doc_no, ref_doc_no, transaction_amount, balance_amount, document_date, transaction_date, location, month_end, acc_code, created_at, updated_at)
     VALUES
      (:accType, :iid, :docNo, :refDocNo, :transactionAmount, :balanceAmount, :documentDate, :transactionDate, :location, :monthEnd, :accCode, :createdAt, :updatedAt)`,
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
        accCode: cusCode,
        createdAt: dateTimeStr,
        updatedAt: dateTimeStr,
      },
      type: sequelizeSource.QueryTypes.INSERT,
    },
  );

  console.log(
    `[CODManagement] Inserted payment_summaries record for order ${orderId} with acc_code='${cusCode}'`,
  );

  return { cusCode, crmDebug };
}

module.exports = { recordCodOrder };
