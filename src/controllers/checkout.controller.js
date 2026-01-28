const { Checkout } = require("../models");

exports.createCheckout = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ message: "Checkout payload is required" });
    }

    const checkout = await Checkout.create({
      user_id: req.user.id,
      payload: req.body,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    });

    const orderId = req.body?.order_id ?? req.body?.orderId ?? null;

    res.status(201).json({
      message: "Checkout created",
      order_id: orderId,
      checkout: {
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
