const { Checkout } = require("../models");

exports.payhereNotify = async (req, res) => {
  console.log("--- PayHere Notify Callback ---");
  console.log("Body:", req.body);

  try {
    const { order_id, status_code } = req.body;

    if (order_id) {
      const checkout = await Checkout.findOne({ where: { order_id: order_id } });
      
      if (checkout) {
        // Ensure we only process if it's a PayHere checkout (type 2)
        if (checkout.type === 2 || checkout.type === "2") {
          await checkout.update({
            payment_payload: req.body,
            payment_status: status_code,
            status: status_code === "2" ? "success" : (status_code === "0" ? "pending" : "failed")
          });
          console.log(`✅ Updated PayHere checkout for order: ${order_id} to status: ${status_code === "2" ? "success" : "failed"}`);
        } else {
          console.log(`⚠️ Received PayHere callback for non-PayHere checkout type: ${checkout.type} (Order: ${order_id})`);
        }
      } else {
        console.log(`❓ Checkout not found for order: ${order_id}`);
      }
    }
  } catch (error) {
    console.error(
      "❌ Error updating checkout from PayHere notify:",
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
      const checkout = await Checkout.findOne({ where: { order_id: order_id } });
      if (checkout && (checkout.type === 2 || checkout.type === "2")) {
        await checkout.update({
          payment_payload: req.body,
          payment_status: status_code,
          status: status_code === "2" ? "success" : "failed",
        });
      }
    }
  } catch (error) {
    console.error(
      "❌ Error updating checkout from PayHere return:",
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
      const checkout = await Checkout.findOne({ where: { order_id: order_id } });
      if (checkout && (checkout.type === 2 || checkout.type === "2")) {
        await checkout.update({
          payment_payload: req.body,
          payment_status: "-1",
          status: "canceled",
        });
      }
    }
  } catch (error) {
    console.error(
      "❌ Error updating checkout from PayHere cancel:",
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
    const order_id = req.body.order_id || req.query.order_id || req.body.merchantOrderId;
    if (order_id) {
      const checkout = await Checkout.findOne({ where: { order_id: order_id } });
      if (checkout) {
        await checkout.update({
          payment_payload: { body: req.body, query: req.query },
          payment_status: "success",
          status: "success"
        });
        console.log(`✅ Updated Mintpay checkout for order: ${order_id} to success`);
      }
    }
  } catch (error) {
    console.error("❌ Error updating checkout from Mintpay success:", error.message);
  }
  
  res.status(200).json({
    message: "Mintpay success redirect received",
    data: { body: req.body, query: req.query }
  });
};

exports.mintpayFailed = async (req, res) => {
  console.log("--- Mintpay Failed Callback ---");
  console.log("Body:", req.body);
  console.log("Query:", req.query);
  
  try {
    const order_id = req.body.order_id || req.query.order_id || req.body.merchantOrderId;
    if (order_id) {
      const checkout = await Checkout.findOne({ where: { order_id: order_id } });
      if (checkout) {
        await checkout.update({
          payment_payload: { body: req.body, query: req.query },
          payment_status: "failed",
          status: "failed"
        });
        console.log(`❌ Updated Mintpay checkout for order: ${order_id} to failed`);
      }
    }
  } catch (error) {
    console.error("❌ Error updating checkout from Mintpay failed:", error.message);
  }
  
  res.status(200).json({
    message: "Mintpay failed redirect received",
    data: { body: req.body, query: req.query }
  });
};

