const crypto = require("crypto");
const {
  Checkout,
  PickAndCollect,
  Cart,
  CartItem,
  Product,
  User,
} = require("../models");
const { sendToUser } = require("../services/notifications/notificationService");
const {
  sendOrderConfirmationEmail,
  generateOrderInvoiceHtml,
} = require("../services/notifications/emailService");

function normalizeCheckoutType(value) {
  if (value === 1 || value === "1") return 1;
  if (value === 2 || value === "2") return 2;
  return null;
}

function generateOrderId() {
  return Number(
    `${Date.now()}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")}`,
  );
}

async function getActiveCartWithProducts(userId) {
  return Cart.findOne({
    where: { user_id: userId, status: "active" },
    include: [
      {
        model: CartItem,
        include: [
          {
            model: Product,
            attributes: ["prod_code", "prod_name", "selling_price"],
          },
        ],
      },
    ],
  });
}

function calculateCartAmount(cart) {
  return (cart?.cart_items || []).reduce((sum, item) => {
    const price = Number(item?.product?.selling_price || 0);
    const quantity = Number(item?.quantity || 0);
    return sum + price * quantity;
  }, 0);
}

function buildPayHereHash(orderId, amount) {
  const merchantId = String(process.env.PAYHERE_MERCHANT_ID || "").trim();
  const merchantSecret = String(
    process.env.PAYHERE_MERCHANT_SECRET || "",
  ).trim();
  const currency =
    String(process.env.PAYHERE_CURRENCY || "LKR").trim() || "LKR";

  if (!merchantId || !merchantSecret) {
    return { error: "PayHere merchant configuration is missing" };
  }

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

  return {
    order_id: orderId,
    amount,
    currency,
    merchant_id: merchantId,
    hash,
  };
}

async function createCardPaymentResponse(userId, body) {
  const cart = await getActiveCartWithProducts(userId);
  if (!cart) {
    return { status: 404, body: { message: "Active cart not found" } };
  }

  const amountValue = calculateCartAmount(cart);
  if (amountValue <= 0) {
    return {
      status: 400,
      body: { message: "Cart is empty or has invalid pricing" },
    };
  }

  const orderId = generateOrderId();
  const { type: _type, ...payload } = body || {};
  const amount = amountValue.toFixed(2);
  const hashPayload = buildPayHereHash(orderId, amount);

  if (hashPayload.error) {
    return { status: 500, body: { message: hashPayload.error } };
  }

  // Extract prod_codes from cart items
  const prodCodes = (cart.cart_items || [])
    .map((item) => item?.product?.prod_code)
    .filter(Boolean);

  const checkout = await Checkout.create({
    order_id: orderId,
    user_id: userId,
    type: 1,
    type_name: "delivery",
    payload: { ...payload, prod_codes: prodCodes },
    status: "pending",
    created_at: new Date(),
    updated_at: new Date(),
  });

  const user = await User.findOne({ where: { id: userId } });
  if (user) {
    sendOrderConfirmationEmail(
      user.toJSON(),
      checkout.toJSON(),
      cart.cart_items || [],
    ).catch(console.error);
  }

  return {
    status: 201,
    body: {
      message: "PayHere hash generated",
      checkout: {
        order_id: checkout.order_id,
        type: checkout.type,
        type_name: checkout.type_name,
        status: checkout.status,
        payload: checkout.payload,
        created_at: checkout.created_at,
      },
      ...hashPayload,
    },
  };
}

exports.createCheckout = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ message: "Checkout payload is required" });
    }

    const type = normalizeCheckoutType(req.body.type);
    if (!type) {
      return res.status(400).json({
        message:
          "type is required and must be 1 (card payment) or 2 (cash on delivery)",
      });
    }

    if (type === 1) {
      const result = await createCardPaymentResponse(req.user.id, req.body);
      return res.status(result.status).json(result.body);
    }

    const { type: _type, ...payload } = req.body;
    const orderId = generateOrderId();

    // For type 2 (COD), also fetch cart and extract prod_codes
    const cart = await getActiveCartWithProducts(req.user.id);
    const prodCodes = cart
      ? (cart.cart_items || [])
          .map((item) => item?.product?.prod_code)
          .filter(Boolean)
      : [];

    const checkout = await Checkout.create({
      order_id: orderId,
      user_id: req.user.id,
      type,
      type_name: "delivery",
      payload: { ...payload, prod_codes: prodCodes },
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    });

    const user = await User.findOne({ where: { id: req.user.id } });
    if (user) {
      sendOrderConfirmationEmail(
        user.toJSON(),
        checkout.toJSON(),
        cart ? cart.cart_items : [],
      ).catch(console.error);
    }

    return res.status(201).json({
      message: "Checkout created",
      order_id: orderId,
      checkout: {
        order_id: checkout.order_id,
        type: checkout.type,
        type_name: checkout.type_name,
        status: checkout.status,
        payload: checkout.payload,
        created_at: checkout.created_at,
      },
    });
  } catch (e) {
    next(e);
  }
};

exports.createPayHereHash = async (req, res, next) => {
  try {
    const result = await createCardPaymentResponse(req.user.id, req.body);
    return res.status(result.status).json(result.body);
  } catch (e) {
    next(e);
  }
};

exports.listCheckouts = async (req, res, next) => {
  try {
    const [checkouts, pickAndCollects] = await Promise.all([
      Checkout.findAll({
        where: { user_id: req.user.id },
      }),
      PickAndCollect.findAll({
        where: { user_id: req.user.id },
      }),
    ]);

    const normalizedCheckouts = checkouts.map((c) => {
      const item = c.toJSON ? c.toJSON() : c;
      return {
        record_type: "checkout",
        order_id: item.order_id,
        type: item.type,
        type_name: item.type_name,
        payload: item.payload,
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    const normalizedPickAndCollects = pickAndCollects.map((p) => {
      const item = p.toJSON ? p.toJSON() : p;
      return {
        record_type: "pick_and_collect",
        pick_and_collect_id: item.pick_and_collect_id,
        prod_code: item.prod_code,
        location: item.location,
        location_name: item.location_name,
        type: item.type,
        type_name: item.type_name,
        picked_qty: Number(item.picked_qty || 0),
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    const items = [...normalizedCheckouts, ...normalizedPickAndCollects].sort(
      (a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      },
    );

    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.updateCheckoutStatus = async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({ message: "status is required" });
    }

    const checkout = await Checkout.findOne({ where: { order_id } });
    if (!checkout)
      return res.status(404).json({ message: "Checkout not found" });

    if (checkout.user_id !== req.user.id) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await checkout.update({ status, updated_at: new Date() });

    await sendToUser(checkout.user_id, {
      title: "Order status updated",
      body: `Your order ${checkout.order_id} status is now ${status}.`,
      data: {
        type: "order_status",
        order_id: String(checkout.order_id),
        status,
      },
    });

    res.json({
      message: "Checkout status updated",
      order_id: checkout.order_id,
      status,
    });
  } catch (e) {
    next(e);
  }
};

exports.getCheckoutBill = async (req, res, next) => {
  try {
    const { order_id } = req.params;

    const checkout = await Checkout.findOne({
      where: { order_id, user_id: req.user.id },
    });

    if (!checkout) {
      return res.status(404).json({ message: "Order not found" });
    }

    const user = await User.findOne({ where: { id: req.user.id } });

    // Attempt to reconstruct cartItems from prod_codes
    const prodCodes = checkout.payload?.prod_codes || [];
    let cartItems = [];

    if (prodCodes.length > 0) {
      const products = await Product.findAll({
        where: { prod_code: prodCodes },
        attributes: ["prod_code", "prod_name", "selling_price"],
      });

      cartItems = products.map((product) => ({
        product: product.toJSON(),
        quantity: 1, // Defaulting to 1 as individual quantities are not stored in Checkout payload currently
      }));
    }

    const htmlContent = generateOrderInvoiceHtml(
      user ? user.toJSON() : req.user,
      checkout.toJSON(),
      cartItems,
      "https://venpaa-v2.s3.ap-southeast-1.amazonaws.com/Logo.png", // Use external logo for API rendering
    );

    res.set("Content-Type", "text/html");
    return res.send(htmlContent);
  } catch (e) {
    next(e);
  }
};
