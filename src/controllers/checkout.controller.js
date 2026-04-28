const crypto = require("crypto");
const {
  Checkout,
  PickAndCollect,
  Cart,
  CartItem,
  Product,
  User,
  CodValueCharge,
  CourierWeightCharge,
  Coupon,
  CouponUsage,
} = require("../models");
const { Op } = require("sequelize");
const {
  sendToUser,
  sendToTopic,
} = require("../services/notifications/notificationService");
const {
  NOTIFICATION_TYPES,
} = require("../services/notifications/notificationTypes");
const { checkStockAvailability } = require("../services/products/stockService");
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
        as: "items",
        include: [
          {
            model: Product,
            attributes: [
              "id",
              "prod_code",
              "prod_name",
              "selling_price",
              "prod_image",
              "weight",
            ],
          },
        ],
      },
    ],
  });
}

async function validateCoupon(code, userId, subTotal, orderType = null) {
  if (!code) return { valid: false };

  const coupon = await Coupon.findOne({
    where: { code: code.trim().toUpperCase(), is_active: true },
  });
  if (!coupon)
    return { valid: false, message: "Invalid or inactive coupon code" };

  // Check if user already used this coupon
  const usage = await CouponUsage.findOne({
    where: { user_id: userId, coupon_id: coupon.id },
  });
  if (usage) {
    return { valid: false, message: "You have already used this coupon code" };
  }

  // Order type validation
  if (orderType === 1 && !coupon.is_card_payment) {
    return { valid: false, message: "Coupon is not valid for Card Payments" };
  }
  if (orderType === 2 && !coupon.is_cod) {
    return {
      valid: false,
      message: "Coupon is not valid for Cash on Delivery",
    };
  }

  // Date validation
  const now = new Date();
  if (coupon.start_date && now < new Date(coupon.start_date)) {
    return { valid: false, message: "Coupon is not yet active" };
  }
  if (coupon.end_date && now > new Date(coupon.end_date)) {
    return { valid: false, message: "Coupon has expired" };
  }

  // Usage limit (Global)
  if (
    coupon.usage_limit !== null &&
    coupon.usage_count >= parseInt(coupon.usage_limit)
  ) {
    return { valid: false, message: "Coupon usage limit reached" };
  }

  // Min order value
  if (subTotal < parseFloat(coupon.min_order_value || 0)) {
    return {
      valid: false,
      message: `Minimum order value of ${coupon.min_order_value} LKR required`,
    };
  }

  // Calculate discount
  let discountAmount = 0;
  if (coupon.discount_type === "percentage") {
    discountAmount = subTotal * (parseFloat(coupon.discount_value) / 100);
    if (
      coupon.max_discount &&
      discountAmount > parseFloat(coupon.max_discount)
    ) {
      discountAmount = parseFloat(coupon.max_discount);
    }
  } else {
    discountAmount = parseFloat(coupon.discount_value);
  }

  return {
    valid: true,
    coupon,
    discountAmount: Math.min(discountAmount, subTotal),
  };
}
exports.validateCoupon = validateCoupon;

async function calculateTotals(
  cart,
  couponCode = null,
  userId = null,
  orderType = null,
) {
  let subTotal = 0;
  let totalWeight = 0;

  const items = cart?.items || cart?.cart_items || [];
  items.forEach((item) => {
    const price = parseFloat(item?.product?.selling_price || 0);
    const weight = parseFloat(item?.product?.weight || 0);
    const quantity = parseInt(item?.quantity || 1, 10);
    subTotal += price * quantity;
    totalWeight += weight * quantity;
  });

  // Calculate COD Charge
  const codChargeEntry = await CodValueCharge.findOne({
    where: {
      value_from: { [Op.lte]: subTotal },
      value_to: { [Op.gte]: subTotal },
    },
  });
  const codCharge = parseFloat(codChargeEntry?.charge || 0);

  // Calculate Courier Charge
  const courierChargeEntry = await CourierWeightCharge.findOne({
    where: {
      weight_from: { [Op.lte]: totalWeight },
      weight_to: { [Op.gte]: totalWeight },
    },
  });
  const courierCharge = parseFloat(courierChargeEntry?.charge || 0);

  // Apply Coupon Discount
  let discountAmount = 0;
  let appliedCoupon = null;
  if (couponCode && userId) {
    const validation = await validateCoupon(
      couponCode,
      userId,
      subTotal,
      orderType,
    );
    if (!validation.valid) {
      const error = new Error(validation.message || "Invalid coupon code");
      error.status = 400;
      throw error;
    }
    discountAmount = validation.discountAmount;
    appliedCoupon = {
      id: validation.coupon.id,
      code: validation.coupon.code,
      discount_type: validation.coupon.discount_type,
      discount_value: validation.coupon.discount_value,
      amount: discountAmount,
    };
  }

  const netTotalWithCod = subTotal + courierCharge + codCharge - discountAmount;
  const netTotalWithOutCod = subTotal + courierCharge - discountAmount;

  return {
    subTotal,
    totalWeight,
    codCharge,
    courierCharge,
    discountAmount,
    appliedCoupon,
    netTotalWithCod,
    netTotalWithOutCod,
  };
}

async function consumeCoupon(userId, couponId, orderId) {
  if (!couponId) return;

  const { Coupon, CouponUsage } = require("../models");
  const sequelize = require("../config/db");

  const transaction = await sequelize.transaction();
  try {
    const coupon = await Coupon.findByPk(couponId, { transaction });
    if (coupon) {
      // 1. Record usage per user
      await CouponUsage.create(
        {
          user_id: userId,
          coupon_id: couponId,
          order_id: String(orderId),
        },
        { transaction },
      );

      // 2. Increment global usage count
      await coupon.increment("usage_count", { by: 1, transaction });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error("Error consuming coupon:", error);
  }
}
exports.consumeCoupon = consumeCoupon;

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

  const totals = await calculateTotals(cart, body?.coupon_code, userId, 1);
  if (totals.subTotal <= 0) {
    return {
      status: 400,
      body: { message: "Cart total must be greater than zero" },
    };
  }

  const orderId = generateOrderId();

  // Consume coupon
  if (totals.appliedCoupon) {
    await consumeCoupon(userId, totals.appliedCoupon.id, orderId);
  }

  const amountValue = totals.netTotalWithOutCod;
  const { type: _type, ...payload } = body || {};
  const amount = amountValue.toFixed(2);
  const hashPayload = buildPayHereHash(orderId, amount);

  if (hashPayload.error) {
    return { status: 500, body: { message: hashPayload.error } };
  }

  // Stock Availability Check (before payment)
  const cartJson = typeof cart.toJSON === "function" ? cart.toJSON() : cart;
  const rawCartItems =
    cartJson.items || cartJson.cart_items || cartJson.CartItems || [];
  const items = rawCartItems
    .map((item) => ({
      product: {
        prod_code:
          item.product?.prod_code ||
          item.product_code ||
          item.prod_code ||
          "N/A",
        prod_name: item.product?.prod_name || item.product_name,
        selling_price: item.product?.selling_price || item.price || 0,
        prod_image: item.product?.prod_image || null,
      },
      quantity: Number(item.quantity || 1),
    }))
    .filter((it) => it.product.prod_code !== "N/A");

  const stockCheck = await checkStockAvailability(items);
  if (!stockCheck.available) {
    return {
      status: 400,
      body: {
        message: "Some items in your cart are out of stock",
        missingItems: stockCheck.missingItems,
      },
    };
  }

  const checkout = await Checkout.create({
    order_id: orderId,
    user_id: userId,
    type: 1,
    type_name: "delivery",
    payload: {
      ...payload,
      items,
      prod_codes: items.map((i) => i.product.prod_code),
      totals,
      location: "001", // Store deduction location
    },
    status: "pending",
    created_at: new Date(),
    updated_at: new Date(),
  });

  const user = await User.findOne({ where: { id: userId } });
  if (user) {
    sendOrderConfirmationEmail(
      typeof user.toJSON === "function" ? user.toJSON() : user,
      typeof checkout.toJSON === "function" ? checkout.toJSON() : checkout,
      items,
    ).catch(console.error);

    // Notify Backoffice
    sendToTopic("backoffice", {
      title: "New Delivery Order",
      body: `Order #${orderId} for ${totals.netTotalWithOutCod} LKR.`,
      data: {
        notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
        order_id: String(orderId),
        user_id: String(userId),
        customer_name: `${user.fname} ${user.lname}`.trim(),
        total: String(totals.netTotalWithOutCod),
      },
    }).catch(console.error);
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

    // For type 2 (COD), also fetch cart and extract items
    const cart = await getActiveCartWithProducts(req.user.id);
    let items = [];
    if (cart) {
      const cartJson = typeof cart.toJSON === "function" ? cart.toJSON() : cart;
      const rawCartItems =
        cartJson.items || cartJson.cart_items || cartJson.CartItems || [];
      items = rawCartItems
        .map((item) => ({
          product: {
            prod_code:
              item.product?.prod_code ||
              item.product_code ||
              item.prod_code ||
              "N/A",
            prod_name:
              item.product?.prod_name || item.product_name || "Unknown Product",
            selling_price: item.product?.selling_price || item.price || 0,
            prod_image: item.product?.prod_image || null,
          },
          quantity: Number(item.quantity || 1),
        }))
        .filter((it) => it.product.prod_code !== "N/A");

      const stockCheck = await checkStockAvailability(items);
      if (!stockCheck.available) {
        return res.status(400).json({
          message: "Some items in your cart are out of stock",
          missingItems: stockCheck.missingItems,
        });
      }
    }

    const totals = await calculateTotals(
      cart,
      req.body.coupon_code,
      req.user.id,
      type,
    );

    const checkout = await Checkout.create({
      order_id: orderId,
      user_id: req.user.id,
      type,
      type_name: "delivery",
      payload: {
        ...payload,
        items,
        prod_codes: items.map((i) => i.product.prod_code),
        totals,
        location: "001",
      },
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Consume coupon
    if (totals.appliedCoupon) {
      await consumeCoupon(req.user.id, totals.appliedCoupon.id, orderId);
    }

    const user = await User.findOne({ where: { id: req.user.id } });
    if (user) {
      sendOrderConfirmationEmail(
        typeof user.toJSON === "function" ? user.toJSON() : user,
        typeof checkout.toJSON === "function" ? checkout.toJSON() : checkout,
        items,
      ).catch(console.error);

      // Notify Backoffice
      sendToTopic("backoffice", {
        title: "New Delivery Order (COD)",
        body: `Order #${orderId} for ${totals.netTotalWithCod} LKR.`,
        data: {
          notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
          order_id: String(orderId),
          user_id: String(req.user.id),
          customer_name: `${user.fname} ${user.lname}`.trim(),
          total: String(totals.netTotalWithCod),
        },
      }).catch(console.error);
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
    console.error("COD Checkout Error:", e);
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
    const { order_id: rawOrderId } = req.params;
    const order_id = rawOrderId ? String(rawOrderId).trim() : "";

    // First try finding in Checkouts
    // Use both string and numeric variants for more robust lookup
    const orderIdValue = isNaN(Number(order_id)) ? order_id : Number(order_id);

    let checkout = await Checkout.findOne({
      where: {
        order_id: orderIdValue,
        user_id: req.user.id,
      },
    });

    let cartItems = [];
    let checkoutObj = null;

    if (checkout) {
      checkoutObj =
        typeof checkout.toJSON === "function" ? checkout.toJSON() : checkout;

      // Ensure payload is an object (it might be a string in some DB configurations)
      let payload = checkoutObj.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          console.error(
            `[Bill] Failed to parse payload string for ${order_id}:`,
            e.message,
          );
        }
      }
      checkoutObj.payload = payload;

      console.log(
        `[Bill] Found Checkout record for ${order_id}. Payload keys:`,
        payload ? Object.keys(payload) : "null",
      );

      // Reconstruct cartItems from payload (prefer items, fallback to prod_codes for old data)
      if (
        payload?.items &&
        Array.isArray(payload.items) &&
        payload.items.length > 0
      ) {
        cartItems = payload.items;
      } else if (
        payload?.prod_codes &&
        Array.isArray(payload.prod_codes) &&
        payload.prod_codes.length > 0
      ) {
        console.log(
          `[Bill] Reconstructing ${payload.prod_codes.length} items from prod_codes for ${order_id}.`,
        );
        const products = await Product.findAll({
          where: { prod_code: payload.prod_codes },
          attributes: ["prod_code", "prod_name", "selling_price", "prod_image"],
        });

        // Use a map to preserve order and handle duplicates if any
        const productMap = {};
        products.forEach((p) => {
          const pJson = typeof p.toJSON === "function" ? p.toJSON() : p;
          productMap[pJson.prod_code] = pJson;
        });

        cartItems = payload.prod_codes.map((code) => ({
          product: productMap[code] || {
            prod_code: code,
            prod_name: "Product " + code,
            selling_price: 0,
          },
          quantity: 1,
        }));
      } else {
        console.warn(
          `[Bill] Checkout ${order_id} found but payload has NO items or prod_codes!`,
        );
      }
    } else {
      // Try finding in PickAndCollects
      const pickAndCollect = await PickAndCollect.findOne({
        where: { pick_and_collect_id: orderIdValue, user_id: req.user.id },
      });

      if (pickAndCollect) {
        const pc = pickAndCollect.toJSON();
        console.log(`[Bill] Found Pick & Collect record for ${order_id}.`);
        const product = await Product.findOne({
          where: { prod_code: pc.prod_code },
        });

        checkoutObj = {
          order_id: pc.pick_and_collect_id,
          type: pc.type,
          type_name: pc.type_name || "pick & collect",
          status: pc.status,
          created_at: pc.created_at,
          payload: { prod_codes: [pc.prod_code] },
        };

        cartItems = [
          {
            product: product
              ? typeof product.toJSON === "function"
                ? product.toJSON()
                : product
              : {
                  prod_code: pc.prod_code,
                  prod_name: pc.prod_name || "Unknown",
                  selling_price: 0,
                },
            quantity: pc.picked_qty || 1,
          },
        ];
      }
    }

    if (!checkoutObj) {
      console.error(
        `[Bill] No record found in either table for order_id: ${order_id}, user_id: ${req.user.id}`,
      );
      return res
        .status(404)
        .json({ message: "Order or Pick & Collect record not found" });
    }

    const user = await User.findOne({ where: { id: req.user.id } });

    const htmlContent = generateOrderInvoiceHtml(
      user ? user.toJSON() : req.user,
      checkoutObj,
      cartItems,
      process.env.EMAIL_LOGO_URL,
    );

    return res.status(200).set("Content-Type", "text/html").send(htmlContent);
  } catch (e) {
    console.error("Error in getCheckoutBill:", e);
    return res.status(500).json({ message: "Error generating invoice bill" });
  }
};
