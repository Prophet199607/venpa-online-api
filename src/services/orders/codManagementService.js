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

module.exports = { recordCodOrder };
