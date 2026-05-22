const crypto = require("crypto");
const { Checkout, PickAndCollect, Cart, CartItem, User, Product } = require("../models");
const { sendOrderPlacedEmail } = require("../services/notifications/emailService");
const { sendToTopic } = require("../services/notifications/notificationService");
const { NOTIFICATION_TYPES } = require("../services/notifications/notificationTypes");

/**
 * Finds a record in either Checkout or PickAndCollect by order_id
 */
async function findOrderRecord(orderId) {
  let record = await Checkout.findOne({
    where: { order_id: orderId },
    include: [{ model: User, attributes: ["id", "fname", "lname", "email", "phone"] }],
  });
  let isPickAndCollect = false;

  if (!record) {
    record = await PickAndCollect.findOne({
      where: { pick_and_collect_id: orderId },
      include: [
        { model: Product, as: "product" },
        { model: User, attributes: ["id", "fname", "lname", "email", "phone"] },
      ],
    });
    isPickAndCollect = true;
  }
  return { record, isPickAndCollect };
}

/**
 * Verifies the md5sig checksum from PayHere notify callback.
 * Formula: md5sig = UPPER(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + UPPER(md5(merchant_secret))))
 */
function verifyPayHereSignature({ merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig }) {
  if (!md5sig) return false;
  const merchantSecret = String(process.env.PAYHERE_MERCHANT_SECRET || "").trim();
  if (!merchantSecret) return false;

  const secretHash = crypto
    .createHash("md5")
    .update(merchantSecret)
    .digest("hex")
    .toUpperCase();

  const localMd5sig = crypto
    .createHash("md5")
    .update(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretHash}`)
    .digest("hex")
    .toUpperCase();

  return localMd5sig === md5sig;
}

/**
 * Shared logic for handling a successful payment.
 * Handles updating the record, clearing the cart, sending emails, and notifications.
 */
async function handleOrderSuccess(record, isPickAndCollect, payload = {}) {
  const wasAlreadySuccess = record.payment_status === "success";

  // 1. Update the record
  await record.update({
    payment_payload: payload,
    payment_status: "success",
    updated_at: new Date(),
  });

  // If it was already success, we don't want to repeat the side effects (emails, cart clearing)
  if (wasAlreadySuccess) {
    console.log(`ℹ️ Order ${isPickAndCollect ? record.pick_and_collect_id : record.order_id} already processed as success.`);
    return;
  }

  // 2. Clear user cart if it's a Delivery checkout
  if (!isPickAndCollect) {
    const cart = await Cart.findOne({ where: { user_id: record.user_id } });
    if (cart) {
      await CartItem.destroy({ where: { cart_id: cart.id } });
      console.log(`🛒 Cart cleared for user: ${record.user_id}`);
    }
  }

  // 3. Send Email & Notify Backoffice
  const user = record.User;
  if (user) {
    let items = [];
    let totals = {};

    if (isPickAndCollect) {
      items = [
        {
          product: record.product ? (record.product.toJSON ? record.product.toJSON() : record.product) : null,
          quantity: record.picked_qty,
        },
      ];
      totals = { netTotalWithoutCod: record.net_amount };
    } else {
      let checkoutPayload = record.payload;
      if (typeof checkoutPayload === "string") {
        try {
          checkoutPayload = JSON.parse(checkoutPayload);
        } catch (e) {
          checkoutPayload = {};
        }
      }
      items = checkoutPayload.items || [];
      totals = checkoutPayload.totals || {};
    }

    sendOrderPlacedEmail(
      typeof user.toJSON === "function" ? user.toJSON() : user,
      typeof record.toJSON === "function" ? record.toJSON() : record,
      items
    ).catch((e) => console.error("Email send failed:", e));

    sendToTopic("backoffice", {
      title: isPickAndCollect ? "Order Payment Success (P&C)" : "Order Payment Success",
      body: `Order #${isPickAndCollect ? record.pick_and_collect_id : record.order_id} payment confirmed.`,
      data: {
        notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
        order_id: String(isPickAndCollect ? record.pick_and_collect_id : record.order_id),
        user_id: String(record.user_id),
        customer_name: `${user.fname} ${user.lname}`.trim(),
        total: String(totals.netTotalWithoutCod || totals.subTotal || 0),
      },
    }).catch(console.error);
    
    console.log(`📧 Confirmation email and notification sent for order: ${isPickAndCollect ? record.pick_and_collect_id : record.order_id}`);
  }
}

exports.payhereNotify = async (req, res) => {
  console.log("--- PayHere Notify Callback ---");
  // Always respond 200 immediately so PayHere doesn't retry
  res.status(200).send("OK");
  try {
    const { order_id, status_code, merchant_id, payhere_amount, payhere_currency, md5sig } = req.body;

    console.log(`📩 PayHere notify received: order=${order_id}, status=${status_code}`);

    // ── Step 1: Verify md5sig signature (required per PayHere docs) ──
    if (!verifyPayHereSignature({ merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig })) {
      console.error("❌ PayHere notify: Invalid md5sig — possible tampered request. Ignoring.");
      return;
    }

    if (!order_id) return;

    // ── Step 2: Find the order record ──
    const { record, isPickAndCollect } = await findOrderRecord(order_id);
    if (!record) {
      console.warn(`⚠️ PayHere notify: No record found for order_id ${order_id}`);
      return;
    }

    // ── Step 3: Handle based on status_code ──
    // PayHere status codes: 2=success, 0=pending, -1=canceled, -2=failed, -3=chargedback
    if (status_code === "2") {
      await handleOrderSuccess(record, isPickAndCollect, req.body);
      console.log(`✅ Payment success handled for order: ${order_id}`);
    } else if (status_code === "0") {
      await record.update({ payment_payload: req.body, payment_status: "pending", updated_at: new Date() });
      console.log(`⏳ Payment pending for order: ${order_id}`);
    } else if (status_code === "-1") {
      await record.update({ payment_payload: req.body, payment_status: "canceled", updated_at: new Date() });
      console.log(`⚠️ Payment canceled for order: ${order_id}`);
    } else if (status_code === "-2") {
      await record.update({ payment_payload: req.body, payment_status: "failed", updated_at: new Date() });
      console.log(`❌ Payment failed for order: ${order_id}`);
    } else if (status_code === "-3") {
      await record.update({ payment_payload: req.body, payment_status: "chargedback", updated_at: new Date() });
      console.log(`🔄 Payment chargedback for order: ${order_id}`);
    } else {
      await record.update({ payment_payload: req.body, payment_status: "failed", updated_at: new Date() });
      console.log(`❓ Unknown status_code ${status_code} for order: ${order_id}`);
    }
  } catch (error) {
    console.error("❌ Error processing PayHere notify:", error.message);
  }
};

exports.payhereReturn = async (req, res) => {
  console.log("--- PayHere Return Callback ---");
  // Per PayHere docs: NO payment status parameters are passed to return_url.
  // Payment processing is handled exclusively in payhereNotify (server callback).
  // The frontend should query the order status from the database after this redirect.
  const order_id = req.body?.order_id || req.query?.order_id || null;
  console.log(`📩 PayHere return redirect received for order: ${order_id}`);

  res.status(200).json({
    message: "Payment return received. Please check your order status.",
    order_id,
  });
};

exports.payhereCancel = async (req, res) => {
  console.log("--- PayHere Cancel Callback ---");
  try {
    const { order_id } = req.body;
    if (order_id) {
      const { record } = await findOrderRecord(order_id);
      if (record) {
        await record.update({
          payment_payload: req.body,
          payment_status: "canceled",
        });
        console.log(`⚠️ Order ${order_id} payment was canceled`);
      }
    }
  } catch (error) {
    console.error("❌ Error updating order from PayHere cancel:", error.message);
  }

  res.status(200).json({
    message: "Payment cancellation redirect received",
    data: req.body,
  });
};

exports.mintpaySuccess = async (req, res) => {
  console.log("--- Mintpay Success Callback ---");
  try {
    const order_id = req.body.order_id || req.query.order_id || req.body.merchantOrderId;
    if (order_id) {
      const { record, isPickAndCollect } = await findOrderRecord(order_id);
      if (record) {
        await handleOrderSuccess(record, isPickAndCollect, { body: req.body, query: req.query });
        console.log(`✅ Success handled for Mintpay callback: ${order_id}`);
      }
    }
  } catch (error) {
    console.error("❌ Error updating order from Mintpay success:", error.message);
  }

  res.status(200).json({
    message: "Mintpay success redirect received",
    data: { body: req.body, query: req.query },
  });
};

exports.mintpayFailed = async (req, res) => {
  console.log("--- Mintpay Failed Callback ---");
  try {
    const order_id = req.body.order_id || req.query.order_id || req.body.merchantOrderId;
    if (order_id) {
      const { record } = await findOrderRecord(order_id);
      if (record) {
        await record.update({
          payment_payload: { body: req.body, query: req.query },
          payment_status: "failed",
        });
        console.log(`❌ Updated Mintpay payment_status to failed: ${order_id}`);
      }
    }
  } catch (error) {
    console.error("❌ Error updating order from Mintpay failed:", error.message);
  }

  res.status(200).json({
    message: "Mintpay failed redirect received",
    data: { body: req.body, query: req.query },
  });
};
