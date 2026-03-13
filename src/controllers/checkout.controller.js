const crypto = require("crypto");
const { Checkout, Cart, CartItem, Product, sequelize } = require("../models");
const { sendToUser } = require("../services/notifications/notificationService");

function normalizeCheckoutType(value) {
  if (value === 1 || value === "1") return 1;
  if (value === 2 || value === "2") return 2;
  return null;
}

function generateOrderId() {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`);
}

exports.createCheckout = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ message: "Checkout payload is required" });
    }

    const orderId = Number(req.body.order_id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "order_id is required and must be a valid integer" });
    }

    const type = normalizeCheckoutType(req.body.type);
    if (!type) {
      return res.status(400).json({
        message: "type is required and must be 1 (card payment) or 2 (cash on delivery)",
      });
    }

    const cart = await Cart.findOne({
      where: { user_id: req.user.id, status: "active", order_id: orderId },
    });

    if (!cart) {
      return res.status(404).json({ message: "Active cart not found for the given order_id" });
    }

    const existingCheckout = await Checkout.findOne({ where: { order_id: orderId } });
    if (existingCheckout) {
      return res.status(409).json({ message: "Checkout already exists for this order_id" });
    }

    const { order_id: _orderId, type: _type, ...payload } = req.body;
    const nextOrderId = generateOrderId();

    const checkout = await sequelize.transaction(async (transaction) => {
      const createdCheckout = await Checkout.create({
        order_id: orderId,
        user_id: req.user.id,
        type,
        payload,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      }, { transaction });

      await CartItem.destroy({
        where: { cart_id: cart.id },
        transaction,
      });

      await cart.update({
        order_id: nextOrderId,
        status: "active",
      }, { transaction });

      return createdCheckout;
    });

    res.status(201).json({
      message: "Checkout created",
      order_id: orderId,
      checkout: {
        order_id: checkout.order_id,
        type: checkout.type,
        status: checkout.status,
        payload: checkout.payload,
        created_at: checkout.created_at,
      },
    });
  } catch (e) { next(e); }
};

exports.getPayHereHash = async (req, res, next) => {
  try {
    const orderId = Number(req.params.order_id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "order_id must be a valid integer" });
    }

    const merchantId = String(process.env.PAYHERE_MERCHANT_ID || "").trim();
    const merchantSecret = String(process.env.PAYHERE_MERCHANT_SECRET || "").trim();
    const currency = String(process.env.PAYHERE_CURRENCY || "LKR").trim() || "LKR";

    if (!merchantId || !merchantSecret) {
      return res.status(500).json({ message: "PayHere merchant configuration is missing" });
    }

    const cart = await Cart.findOne({
      where: { user_id: req.user.id, status: "active", order_id: orderId },
      include: [
        {
          model: CartItem,
          include: [
            {
              model: Product,
              attributes: ["prod_code", "selling_price"],
            },
          ],
        },
      ],
    });

    if (!cart) {
      return res.status(404).json({ message: "Active cart not found for the given order_id" });
    }

    const amountValue = (cart.cart_items || []).reduce((sum, item) => {
      const price = Number(item?.product?.selling_price || 0);
      const quantity = Number(item?.quantity || 0);
      return sum + (price * quantity);
    }, 0);

    if (amountValue <= 0) {
      return res.status(400).json({ message: "Cart is empty or has invalid pricing" });
    }

    const amount = amountValue.toFixed(2);
    const secretHash = crypto
      .createHash("md5")
      .update(merchantSecret)
      .digest("hex")
      .toUpperCase();

    const hash = crypto
      .createHash("md5")
      .update(`${merchantId}${orderId}${amount}${currency}${secretHash}`)
      .digest("hex")
      .toUpperCase();

    res.json({
      order_id: orderId,
      amount,
      currency,
      merchant_id: merchantId,
      hash,
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
