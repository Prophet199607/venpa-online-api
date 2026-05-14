const { Checkout, PickAndCollect, Cart, CartItem, User, Product } = require("../models");
const { sendOrderConfirmationEmail } = require("../services/notifications/emailService");
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

    sendOrderConfirmationEmail(
      user.toJSON ? user.toJSON() : user,
      record.toJSON ? record.toJSON() : record,
      items
    ).catch(console.error);

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
  try {
    const { order_id, status_code } = req.body;
    if (order_id) {
      const { record, isPickAndCollect } = await findOrderRecord(order_id);
      if (record) {
        if (status_code === "2") {
          await handleOrderSuccess(record, isPickAndCollect, req.body);
          console.log(`✅ Success handled for PayHere notify: ${order_id}`);
        } else {
          await record.update({
            payment_payload: req.body,
            payment_status: status_code === "-2" ? "canceled" : "failed",
          });
          console.log(`❌ Payment ${status_code === "-2" ? "canceled" : "failed"} for order: ${order_id}`);
        }
      }
    }
  } catch (error) {
    console.error("❌ Error updating order from PayHere notify:", error.message);
  }
  res.status(200).send("OK");
};

exports.payhereReturn = async (req, res) => {
  console.log("--- PayHere Return Callback ---");
  try {
    const { order_id, status_code } = req.body;
    if (order_id) {
      const { record, isPickAndCollect } = await findOrderRecord(order_id);
      if (record) {
        // Status code "2" means success in PayHere
        if (status_code === "2") {
          await handleOrderSuccess(record, isPickAndCollect, req.body);
          console.log(`✅ Success handled for PayHere return: ${order_id}`);
        } else {
          await record.update({
            payment_payload: req.body,
            payment_status: "failed",
          });
        }
      }
    }
  } catch (error) {
    console.error("❌ Error updating order from PayHere return:", error.message);
  }

  res.status(200).json({
    message: "Payment return redirect received",
    data: req.body,
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
