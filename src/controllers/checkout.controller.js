const { Checkout } = require("../models");
const { sendToUser } = require("../services/notifications/notificationService");

exports.createCheckout = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ message: "Checkout payload is required" });
    }

    const orderId = Number(`${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`);

    const checkout = await Checkout.create({
      order_id: orderId,
      user_id: req.user.id,
      payload: req.body,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    });

    res.status(201).json({
      message: "Checkout created",
      order_id: orderId,
      checkout: {
        order_id: checkout.order_id,
        status: checkout.status,
        payload: checkout.payload,
        created_at: checkout.created_at,
      },
    });
  } catch (e) { next(e); }
};

exports.listCheckouts = async (req, res, next) => {
  try {
    const items = await Checkout.findAll({
      where: { user_id: req.user.id },
      order: [["created_at", "DESC"]],
      attributes: { exclude: ["id", "user_id"] },
    });
    res.json(items);
  } catch (e) { next(e); }
};

exports.updateCheckoutStatus = async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({ message: "status is required" });
    }

    const checkout = await Checkout.findOne({ where: { order_id } });
    if (!checkout) return res.status(404).json({ message: "Checkout not found" });

    if (checkout.user_id !== req.user.id) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await checkout.update({ status, updated_at: new Date() });

    await sendToUser(checkout.user_id, {
      title: "Order status updated",
      body: `Your order ${checkout.order_id} status is now ${status}.`,
      data: { type: "order_status", order_id: String(checkout.order_id), status }
    });

    res.json({ message: "Checkout status updated", order_id: checkout.order_id, status });
  } catch (e) { next(e); }
};
