const { Op } = require("sequelize");
const {
  Checkout,
  PickAndCollect,
  Cart,
  CartItem,
  User,
  Product,
} = require("../models");
const {
  sendOrderPlacedEmail,
} = require("../services/notifications/emailService");
const {
  sendToTopic,
} = require("../services/notifications/notificationService");
const {
  NOTIFICATION_TYPES,
} = require("../services/notifications/notificationTypes");
const mintpayService = require("../services/payments/mintpayService");
const payhereService = require("../services/payments/payhereService");

function orderIdCandidates(orderId) {
  const value = payhereService.normalizeValue(orderId);
  const numeric = Number(value);
  if (Number.isSafeInteger(numeric)) {
    return { [Op.in]: [value, numeric] };
  }
  return value;
}

async function findOrderRecord(orderId) {
  const lookup = orderIdCandidates(orderId);
  let record = await Checkout.findOne({
    where: { order_id: lookup },
    include: [
      { model: User, attributes: ["id", "fname", "lname", "email", "phone"] },
    ],
  });
  let isPickAndCollect = false;

  if (!record) {
    record = await PickAndCollect.findOne({
      where: { pick_and_collect_id: lookup },
      include: [
        { model: Product, as: "product" },
        { model: User, attributes: ["id", "fname", "lname", "email", "phone"] },
      ],
    });
    isPickAndCollect = Boolean(record);
  }
  return { record, isPickAndCollect };
}

function parseJsonField(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function expectedPayHereAmount(record, isPickAndCollect) {
  if (isPickAndCollect) return Number(record.net_amount || 0);
  const payload = parseJsonField(record.payload);
  return Number(payload.totals?.netTotalWithoutCod || 0);
}

async function ensureOrderAssociations(record, isPickAndCollect) {
  if (!record.User && record.user_id) {
    record.User = await User.findOne({
      where: { id: record.user_id },
      attributes: ["id", "fname", "lname", "email", "phone"],
    });
  }
  if (isPickAndCollect && !record.product && record.prod_code) {
    record.product = await Product.findOne({
      where: { prod_code: record.prod_code },
    });
  }
  return record;
}

function resolveStoredPurchaseId(record) {
  const stored = parseJsonField(record.payment_payload);
  return stored?.purchase_id || stored?.purchaseId || null;
}

async function verifyWithMintpay(record) {
  const purchaseId = resolveStoredPurchaseId(record);
  if (!purchaseId) {
    console.error(
      `❌ Mintpay verify: no stored purchase_id for order ${record.pick_and_collect_id || record.order_id}`,
    );
    return {
      verified: false,
      status: "unknown",
      rawStatus: null,
      purchaseId: null,
    };
  }

  try {
    const purchase = await mintpayService.getPurchase(purchaseId);
    const statusValue =
      purchase?.status ??
      purchase?.payment_status ??
      purchase?.state ??
      purchase?.purchase_status ??
      "";
    return {
      verified: true,
      status: mintpayService.classifyStatus(statusValue),
      rawStatus: statusValue,
      purchaseId,
    };
  } catch (error) {
    console.error(
      `❌ Mintpay verification request failed for purchase ${purchaseId}:`,
      error.message,
    );
    return { verified: false, status: "unknown", rawStatus: null, purchaseId };
  }
}

async function handleOrderSuccess(record, isPickAndCollect, payload = {}) {
  const wasAlreadySuccess = record.payment_status === "success";

  await record.update({
    payment_payload: payload,
    payment_status: "success",
    updated_at: new Date(),
  });

  if (wasAlreadySuccess) {
    console.log(
      `ℹ️ Order ${isPickAndCollect ? record.pick_and_collect_id : record.order_id} already processed as success.`,
    );
    return;
  }

  if (!isPickAndCollect) {
    const cart = await Cart.findOne({ where: { user_id: record.user_id } });
    if (cart) {
      await CartItem.destroy({ where: { cart_id: cart.id } });
      console.log(`🛒 Cart cleared for user: ${record.user_id}`);
    }
  }

  await ensureOrderAssociations(record, isPickAndCollect);
  const user = record.User;
  if (!user) return;

  let items = [];
  let totals = {};

  if (isPickAndCollect) {
    items = [
      {
        product: record.product
          ? record.product.toJSON
            ? record.product.toJSON()
            : record.product
          : null,
        quantity: record.picked_qty,
      },
    ];
    totals = { netTotalWithoutCod: record.net_amount };
  } else {
    const checkoutPayload = parseJsonField(record.payload);
    items = checkoutPayload.items || [];
    totals = checkoutPayload.totals || {};
  }

  sendOrderPlacedEmail(
    typeof user.toJSON === "function" ? user.toJSON() : user,
    typeof record.toJSON === "function" ? record.toJSON() : record,
    items,
  ).catch((e) => console.error("Email send failed:", e));

  sendToTopic("backoffice", {
    title: isPickAndCollect
      ? "Order Payment Success (P&C)"
      : "Order Payment Success",
    body: `Order #${isPickAndCollect ? record.pick_and_collect_id : record.order_id} payment confirmed.`,
    data: {
      notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
      order_id: String(
        isPickAndCollect ? record.pick_and_collect_id : record.order_id,
      ),
      user_id: String(record.user_id),
      customer_name: `${user.fname} ${user.lname}`.trim(),
      total: String(totals.netTotalWithoutCod || totals.subTotal || 0),
    },
  }).catch(console.error);

  console.log(
    `📧 Confirmation email and notification sent for order: ${isPickAndCollect ? record.pick_and_collect_id : record.order_id}`,
  );
}

async function confirmPayHereOrder(record, isPickAndCollect) {
  if (!record) return record;

  const currentStatus = String(record.payment_status || "").toLowerCase();
  if (currentStatus === "success") return record;
  if (["failed", "canceled", "cancelled", "chargedback"].includes(currentStatus)) {
    return record;
  }

  const orderId = isPickAndCollect
    ? record.pick_and_collect_id
    : record.order_id;

  try {
    const { payments } = await payhereService.searchPaymentsByOrderId(orderId);
    const payment = payhereService.pickBestPayment(payments);
    if (!payment) {
      console.log(`⏳ PayHere retrieval found no payment yet for order ${orderId}`);
      return record;
    }

    const classified = payhereService.classifyMerchantStatus(payment.status);
    const paidAmount = payment.amount ?? payment.amount_detail?.gross;
    if (
      classified === "success" &&
      !payhereService.amountsMatch(
        expectedPayHereAmount(record, isPickAndCollect),
        paidAmount,
      )
    ) {
      console.error(
        `❌ PayHere retrieval amount mismatch for order ${orderId}. expected=${expectedPayHereAmount(record, isPickAndCollect)} actual=${paidAmount}`,
      );
      return record;
    }

    if (classified === "success") {
      await handleOrderSuccess(record, isPickAndCollect, {
        source: "payhere_retrieval",
        ...payment,
      });
      await record.reload();
      console.log(`✅ PayHere retrieval confirmed order ${orderId}`);
      return record;
    }

    if (classified === "chargedback" || classified === "refunded") {
      await record.update({
        payment_payload: { source: "payhere_retrieval", ...payment },
        payment_status: classified,
        updated_at: new Date(),
      });
      await record.reload();
    }
  } catch (error) {
    console.error(
      `❌ PayHere retrieval failed for order ${orderId}:`,
      error.response?.data || error.message,
    );
  }

  return record;
}

exports.confirmPayHereOrder = confirmPayHereOrder;

exports.payhereNotify = async (req, res) => {
  console.log("--- PayHere Notify Callback ---");
  try {
    const body = req.body || {};
    const orderId = payhereService.normalizeValue(body.order_id);
    const paymentId = payhereService.normalizeValue(body.payment_id);
    const statusCode = payhereService.normalizeValue(body.status_code);

    console.log(
      `📩 PayHere notify received: order=${orderId}, payment=${paymentId}, status=${statusCode}, content-type=${req.get("content-type") || "n/a"}`,
    );

    if (
      !payhereService.verifyNotifySignature({
        merchant_id: body.merchant_id,
        order_id: orderId,
        payhere_amount: body.payhere_amount,
        payhere_currency: body.payhere_currency,
        status_code: statusCode,
        md5sig: body.md5sig,
      })
    ) {
      console.error("❌ PayHere notify: Invalid md5sig or merchant_id. Ignoring.");
      return res.status(400).send("Invalid signature");
    }

    if (!orderId) return res.status(400).send("Missing order_id");

    const { record, isPickAndCollect } = await findOrderRecord(orderId);
    if (!record) {
      console.warn(`⚠️ PayHere notify: No record found for order_id ${orderId}`);
      return res.status(404).send("Order not found");
    }

    const mappedStatus = payhereService.classifyNotifyStatus(statusCode);
    if (record.payment_status === "success" && mappedStatus !== "success") {
      console.log(
        `ℹ️ PayHere notify: Order ${orderId} is already successful; ignoring ${statusCode}.`,
      );
      return res.status(200).send("OK");
    }

    if (mappedStatus === "success") {
      if (
        !payhereService.amountsMatch(
          expectedPayHereAmount(record, isPickAndCollect),
          body.payhere_amount,
        )
      ) {
        console.error(
          `❌ PayHere notify amount mismatch for order ${orderId}. expected=${expectedPayHereAmount(record, isPickAndCollect)} actual=${body.payhere_amount}`,
        );
        return res.status(200).send("OK");
      }
      await handleOrderSuccess(record, isPickAndCollect, body);
      console.log(`✅ Payment success handled for order: ${orderId}`);
    } else {
      await record.update({
        payment_payload: body,
        payment_status: mappedStatus,
        updated_at: new Date(),
      });
      console.log(
        `ℹ️ Payment ${mappedStatus} recorded for order: ${orderId}`,
      );
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error processing PayHere notify:", error.message);
    return res.status(500).send("Error processing payment notification");
  }
};

exports.payhereReturn = async (req, res) => {
  console.log("--- PayHere Return Callback ---");
  const order_id = req.body?.order_id || req.query?.order_id || null;
  console.log(`📩 PayHere return redirect received for order: ${order_id}`);

  res.status(200).json({
    message: "Payment return received. Please check your order status.",
    order_id,
  });
};

exports.payhereCancel = (req, res) => {
  console.log("--- PayHere Cancel Callback ---");
  const orderId = req.body?.order_id || req.query?.order_id || null;
  console.log(`📩 PayHere cancel redirect received for order: ${orderId}`);

  return res.status(200).json({
    message: "Payment cancellation redirect received",
    order_id: orderId,
    data: { ...(req.query || {}), ...(req.body || {}) },
  });
};

exports.mintpaySuccess = async (req, res) => {
  console.log("--- Mintpay Success Callback ---");
  try {
    const order_id =
      req.body?.order_id || req.query?.order_id || req.body?.merchantOrderId;

    if (!order_id) {
      console.warn("⚠️ Mintpay success redirect without order_id — ignored.");
      return res.status(400).json({
        message: "Mintpay success redirect ignored: order_id missing",
      });
    }

    const { record, isPickAndCollect } = await findOrderRecord(order_id);
    if (!record) {
      console.warn(`⚠️ Mintpay success: no record found for order_id ${order_id}`);
      return res.status(404).json({
        message: "Mintpay success redirect ignored: order not found",
      });
    }

    const verification = await verifyWithMintpay(record);

    if (verification.status === "success") {
      await handleOrderSuccess(record, isPickAndCollect, {
        body: req.body,
        query: req.query,
        purchase_id: verification.purchaseId,
        mintpay_status: verification.rawStatus,
        verified_with_mintpay: true,
      });
      console.log(`✅ Mintpay payment verified & confirmed: ${order_id}`);
      return res.status(200).json({
        message: "Mintpay payment verified and confirmed",
        order_id,
        verified: true,
      });
    }

    if (verification.status === "failed") {
      await record.update({
        payment_payload: { body: req.body, query: req.query },
        payment_status: "failed",
        updated_at: new Date(),
      });
      console.warn(
        `❌ Mintpay reports FAILED for order ${order_id} on success redirect.`,
      );
      return res.status(200).json({
        message: "Mintpay reports this payment as failed",
        order_id,
        verified: true,
        payment_status: "failed",
      });
    }

    if (verification.status === "canceled") {
      await record.update({
        payment_payload: { body: req.body, query: req.query },
        payment_status: "canceled",
        updated_at: new Date(),
      });
      console.warn(
        `⚠️ Mintpay reports CANCELED for order ${order_id} on success redirect.`,
      );
      return res.status(200).json({
        message: "Mintpay reports this payment as canceled",
        order_id,
        verified: true,
        payment_status: "canceled",
      });
    }

    if (!verification.verified) {
      console.error(
        `❌ Mintpay success could NOT be verified for order ${order_id}. Order left pending.`,
      );
    } else {
      console.log(`⏳ Mintpay still pending for order ${order_id}.`);
    }
    return res.status(200).json({
      message: verification.verified
        ? "Mintpay reports payment still pending"
        : "Payment could not be verified with Mintpay; order remains pending",
      order_id,
      verified: false,
      payment_status: "pending",
    });
  } catch (error) {
    console.error("❌ Error updating order from Mintpay success:", error.message);
    return res.status(500).json({
      message: "Error processing Mintpay success callback",
    });
  }
};

exports.mintpayFailed = async (req, res) => {
  console.log("--- Mintpay Failed Callback ---");
  try {
    const order_id =
      req.body?.order_id || req.query?.order_id || req.body?.merchantOrderId;

    if (!order_id) {
      console.warn("⚠️ Mintpay failed redirect without order_id — ignored.");
      return res.status(400).json({
        message: "Mintpay failed redirect ignored: order_id missing",
      });
    }

    const { record, isPickAndCollect } = await findOrderRecord(order_id);
    if (!record) {
      console.warn(`⚠️ Mintpay failed: no record found for order_id ${order_id}`);
      return res.status(404).json({
        message: "Mintpay failed redirect ignored: order not found",
      });
    }

    if (record.payment_status === "success") {
      console.log(
        `ℹ️ Order ${order_id} already paid; ignoring Mintpay fail redirect.`,
      );
      return res.status(200).json({
        message: "Order already confirmed as paid; ignoring failed redirect",
        order_id,
        payment_status: "success",
      });
    }

    const verification = await verifyWithMintpay(record);

    if (verification.status === "success") {
      await handleOrderSuccess(record, isPickAndCollect, {
        body: req.body,
        query: req.query,
        purchase_id: verification.purchaseId,
        mintpay_status: verification.rawStatus,
        verified_with_mintpay: true,
      });
      console.log(
        `✅ Mintpay verified SUCCESS despite fail redirect: ${order_id}`,
      );
      return res.status(200).json({
        message: "Mintpay confirms payment succeeded",
        order_id,
        verified: true,
        payment_status: "success",
      });
    }

    if (
      verification.status === "failed" ||
      verification.status === "canceled"
    ) {
      await record.update({
        payment_payload: { body: req.body, query: req.query },
        payment_status: verification.status,
        updated_at: new Date(),
      });
      console.log(
        `⚠️ Mintpay confirmed ${verification.status.toUpperCase()}: ${order_id}`,
      );
      return res.status(200).json({
        message: `Mintpay confirms payment was ${verification.status}`,
        order_id,
        verified: true,
        payment_status: verification.status,
      });
    }

    console.warn(
      `⚠️ Mintpay fail redirect could not be confirmed as failed for ${order_id}. Order left pending.`,
    );
    return res.status(200).json({
      message: verification.verified
        ? "Mintpay does not report failure; order remains pending"
        : "Payment could not be verified with Mintpay; order remains pending",
      order_id,
      verified: false,
      payment_status: "pending",
    });
  } catch (error) {
    console.error("❌ Error updating order from Mintpay failed:", error.message);
    return res.status(500).json({
      message: "Error processing Mintpay failed callback",
    });
  }
};
