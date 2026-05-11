const { Checkout, PickAndCollect } = require("../models");

/**
 * Finds a record in either Checkout or PickAndCollect by order_id
 */
async function findOrderRecord(orderId) {
  let record = await Checkout.findOne({ where: { order_id: orderId } });
  let isPickAndCollect = false;

  if (!record) {
    record = await PickAndCollect.findOne({
      where: { pick_and_collect_id: orderId },
    });
    isPickAndCollect = true;
  }
  return { record, isPickAndCollect };
}

exports.payhereNotify = async (req, res) => {
  console.log("--- PayHere Notify Callback ---");
  console.log("Body:", req.body);

  try {
    const { order_id, status_code } = req.body;

    if (order_id) {
      const { record } = await findOrderRecord(order_id);

      if (record) {
        await record.update({
          payment_payload: req.body,
          payment_status: status_code === "2" ? "success" : "failed",
          // Status column is NOT updated as per user request
        });
        console.log(
          `✅ Updated PayHere payment_status for order: ${order_id} to: ${status_code === "2" ? "success" : "failed"}`,
        );
      } else {
        console.log(`❓ Order record not found for order: ${order_id}`);
      }
    }
  } catch (error) {
    console.error(
      "❌ Error updating order from PayHere notify:",
      error.message,
    );
  }

  res.status(200).send("OK");
};

exports.payhereReturn = async (req, res) => {
  console.log("--- PayHere Return Callback ---");
  console.log("Body:", req.body);

  try {
    const { order_id, status_code } = req.body;
    if (order_id) {
      const { record } = await findOrderRecord(order_id);
      if (record) {
        await record.update({
          payment_payload: req.body,
          payment_status: status_code === "2" ? "success" : "failed",
        });
        console.log(
          `✅ Updated PayHere payment_status via return for order: ${order_id}`,
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ Error updating order from PayHere return:",
      error.message,
    );
  }

  res.status(200).json({
    message: "Payment successful redirect received",
    data: req.body,
  });
};

exports.payhereCancel = async (req, res) => {
  console.log("--- PayHere Cancel Callback ---");
  console.log("Body:", req.body);

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
    console.error(
      "❌ Error updating order from PayHere cancel:",
      error.message,
    );
  }

  res.status(200).json({
    message: "Payment cancellation redirect received",
    data: req.body,
  });
};

exports.mintpaySuccess = async (req, res) => {
  console.log("--- Mintpay Success Callback ---");
  console.log("Body:", req.body);
  console.log("Query:", req.query);

  try {
    const order_id =
      req.body.order_id || req.query.order_id || req.body.merchantOrderId;
    if (order_id) {
      const { record } = await findOrderRecord(order_id);
      if (record) {
        await record.update({
          payment_payload: { body: req.body, query: req.query },
          payment_status: "success",
        });
        console.log(`✅ Updated Mintpay payment_status for order: ${order_id}`);
      }
    }
  } catch (error) {
    console.error(
      "❌ Error updating order from Mintpay success:",
      error.message,
    );
  }

  res.status(200).json({
    message: "Mintpay success redirect received",
    data: { body: req.body, query: req.query },
  });
};

exports.mintpayFailed = async (req, res) => {
  console.log("--- Mintpay Failed Callback ---");
  console.log("Body:", req.body);
  console.log("Query:", req.query);

  try {
    const order_id =
      req.body.order_id || req.query.order_id || req.body.merchantOrderId;
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
    console.error(
      "❌ Error updating order from Mintpay failed:",
      error.message,
    );
  }

  res.status(200).json({
    message: "Mintpay failed redirect received",
    data: { body: req.body, query: req.query },
  });
};

