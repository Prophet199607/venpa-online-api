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
  ProductDiscount,
  GiftReceiverDetail,
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
const { buildPriceLevelMap } = require("../services/products/priceService");

function normalizeCheckoutType(value) {
  if (value === 1 || value === "1") return 1; // COD
  if (value === 2 || value === "2") return 2; // Card (PayHere)
  if (value === 3 || value === "3") return 3; // Mintpay
  return null;
}

function getDiscountedPrice(prodCode, originalPrice, discountMap) {
  if (prodCode && discountMap && discountMap[prodCode]) {
    const d = discountMap[prodCode];
    let price = parseFloat(originalPrice || 0);
    if (parseFloat(d.discount_amount || 0) > 0) {
      price = Math.max(0, price - parseFloat(d.discount_amount));
    } else if (parseFloat(d.discount_percentage || 0) > 0) {
      price = price * (1 - parseFloat(d.discount_percentage) / 100);
    }
    return price;
  }
  return parseFloat(originalPrice || 0);
}

function generateOrderId() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
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
  let originalSubTotal = 0;
  let productDiscountTotal = 0;
  let subTotal = 0;
  let totalWeight = 0;

  const items = cart?.items || cart?.cart_items || [];

  // Fetch active discounts for products in cart
  const prodCodes = items
    .map((item) => item?.product?.prod_code)
    .filter(Boolean);
  const nowStr = new Date().toISOString().slice(0, 10);

  const discounts = await ProductDiscount.findAll({
    where: {
      prod_code: { [Op.in]: prodCodes },
      status: 1,
      [Op.and]: [
        {
          [Op.or]: [
            { start_date: null },
            { start_date: "" },
            { start_date: { [Op.lte]: nowStr } },
          ],
        },
        {
          [Op.or]: [
            { end_date: null },
            { end_date: "" },
            { end_date: { [Op.gte]: nowStr } },
          ],
        },
      ],
    },
  });

  const discountMap = {};
  discounts.forEach((d) => {
    discountMap[d.prod_code] = d;
  });

  // Fetch latest price levels for products in cart
  const priceLevelMap = await buildPriceLevelMap(
    items.map((i) => i.product).filter(Boolean),
  );

  items.forEach((item) => {
    const prodCode = item?.product?.prod_code;
    const pl = prodCode
      ? priceLevelMap.get(prodCode.trim().toUpperCase())
      : null;
    const latestPrice = pl?.selling_price;
    const originalPrice = parseFloat(
      latestPrice || item?.product?.selling_price || 0,
    );
    let price = originalPrice;

    const quantity = parseInt(item?.quantity || 1, 10);

    // Apply product discount if exists
    if (prodCode && discountMap[prodCode]) {
      const d = discountMap[prodCode];
      if (parseFloat(d.discount_amount || 0) > 0) {
        price = Math.max(0, price - parseFloat(d.discount_amount));
      } else if (parseFloat(d.discount_percentage || 0) > 0) {
        price = price * (1 - parseFloat(d.discount_percentage) / 100);
      }
    }

    const weight = parseFloat(item?.product?.weight || 0);
    originalSubTotal += originalPrice * quantity;
    productDiscountTotal += (originalPrice - price) * quantity;
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
      is_cod: !!validation.coupon.is_cod,
      is_card_payment: !!validation.coupon.is_card_payment,
    };
  }

  const codDiscount =
    appliedCoupon && appliedCoupon.is_cod ? appliedCoupon.amount : 0;
  const cardDiscount =
    appliedCoupon && appliedCoupon.is_card_payment ? appliedCoupon.amount : 0;

  const netTotalWithCod = subTotal + courierCharge + codCharge - codDiscount;
  const netTotalWithoutCod = subTotal + courierCharge - cardDiscount;

  return {
    originalSubTotal,
    productDiscountTotal,
    subTotal,
    totalWeight,
    codCharge,
    courierCharge,
    discountAmount,
    appliedCoupon,
    netTotalWithCod,
    netTotalWithoutCod,
    discountMap,
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

async function createCardPaymentResponse(userId, body, persist = true) {
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

  const orderId = body?.order_id || generateOrderId();

  // Consume coupon
  if (totals.appliedCoupon && persist) {
    await consumeCoupon(userId, totals.appliedCoupon.id, orderId);
  }

  const amountValue = totals.netTotalWithoutCod;
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
        prod_name:
          item.product?.prod_name || item.product_name || "Unknown Product",
        selling_price: getDiscountedPrice(
          item.product?.prod_code,
          item.product?.selling_price || item.price || 0,
          totals.discountMap,
        ),
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

  let checkout;
  if (persist) {
    checkout = await Checkout.create({
      order_id: orderId,
      user_id: userId,
      type: 2, // Card (PayHere)
      type_name: "delivery",
      payload: {
        ...payload,
        items,
        prod_codes: items.map((i) => i.product.prod_code),
        totals,
        location: "001", // Store deduction location
      },
      status: "pending",
      payment_status: "pending",
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
        body: `Order #${orderId} for ${totals.netTotalWithoutCod} LKR.`,
        data: {
          notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
          order_id: String(orderId),
          user_id: String(userId),
          customer_name: `${user.fname} ${user.lname}`.trim(),
          total: String(totals.netTotalWithoutCod),
        },
      }).catch(console.error);
    }
  } else {
    // Return a mock checkout object for the response if not persisting
    checkout = {
      order_id: orderId,
      type: 2,
      type_name: "delivery",
      status: "pending",
      payload: {
        ...payload,
        items,
        prod_codes: items.map((i) => i.product.prod_code),
        totals,
        location: "001",
      },
      created_at: new Date(),
    };
  }

  return {
    status: 201,
    body: {
      message: persist
        ? "Order created and PayHere hash generated"
        : "PayHere hash generated (not saved)",
      order_id: orderId,
      amount,
      currency: "LKR",
      merchant_id: process.env.PAYHERE_MERCHANT_ID,
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

    if (type === 2) {
      const result = await createCardPaymentResponse(
        req.user.id,
        req.body,
        true,
      );

      // Handle Gift Details for type 2 (if successful)
      if (result.status === 201 && req.body.isGift && req.body.giftDetails) {
        const checkout = await Checkout.findOne({
          where: { order_id: result.body.checkout.order_id },
        });
        if (checkout) {
          await GiftReceiverDetail.create({
            order_id: checkout.order_id,
            ...req.body.giftDetails,
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      }

      return res.status(result.status).json(result.body);
    }

    if (type === 3) {
      const result = await processMintpayResponse(req.user.id, req.body, true);

      // Handle Gift Details for type 3 (if successful)
      if (result.status === 201 && req.body.isGift && req.body.giftDetails) {
        const checkout = await Checkout.findOne({
          where: { order_id: result.body.checkout.order_id },
        });
        if (checkout) {
          await GiftReceiverDetail.create({
            order_id: checkout.order_id,
            ...req.body.giftDetails,
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      }

      return res.status(result.status).json(result.body);
    }

    const { type: _type, ...payload } = req.body;
    const orderId = generateOrderId();

    // For type 2 (COD), also fetch cart and extract items
    const cart = await getActiveCartWithProducts(req.user.id);
    const totals = await calculateTotals(
      cart,
      req.body.coupon_code,
      req.user.id,
      type,
    );

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
            selling_price: getDiscountedPrice(
              item.product?.prod_code,
              item.product?.selling_price || item.price || 0,
              totals.discountMap,
            ),
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

    // Totals calculated above

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
      payment_status: "success", // Type 1 is COD, always success as requested
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Handle Gift Details
    if (req.body.isGift && req.body.giftDetails) {
      await GiftReceiverDetail.create({
        order_id: checkout.order_id,
        ...req.body.giftDetails,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Consume coupon
    if (totals.appliedCoupon) {
      await consumeCoupon(req.user.id, totals.appliedCoupon.id, orderId);
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
    console.error("Checkout Error:", e);
    next(e);
  }
};

async function processMintpayResponse(userId, body, persist = true) {
  const cart = await getActiveCartWithProducts(userId);
  if (!cart) {
    return { status: 404, body: { message: "Active cart not found" } };
  }

  const totals = await calculateTotals(cart, body?.coupon_code, userId, 3);
  if (totals.subTotal <= 0) {
    return {
      status: 400,
      body: { message: "Cart total must be greater than zero" },
    };
  }

  const orderId = generateOrderId();

  // Consume coupon
  if (totals.appliedCoupon && persist) {
    await consumeCoupon(userId, totals.appliedCoupon.id, orderId);
  }

  // Stock Availability Check
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
        prod_name:
          item.product?.prod_name || item.product_name || "Unknown Product",
        selling_price: getDiscountedPrice(
          item.product?.prod_code,
          item.product?.selling_price || item.price || 0,
          totals.discountMap,
        ),
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

  const { type: _type, ...payload } = body || {};

  let checkout;
  if (persist) {
    checkout = await Checkout.create({
      order_id: orderId,
      user_id: userId,
      type: 3, // Mintpay
      type_name: "delivery",
      payload: {
        ...payload,
        items,
        prod_codes: items.map((i) => i.product.prod_code),
        totals,
        location: "001",
      },
      status: "pending",
      payment_status: "pending",
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
        title: "New Delivery Order (Mintpay)",
        body: `Order #${orderId} for ${totals.netTotalWithoutCod} LKR.`,
        data: {
          notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
          order_id: String(orderId),
          user_id: String(userId),
          customer_name: `${user.fname} ${user.lname}`.trim(),
          total: String(totals.netTotalWithoutCod),
        },
      }).catch(console.error);
    }
  } else {
    checkout = {
      order_id: orderId,
      type: 3,
      type_name: "delivery",
      status: "pending",
      payload: {
        ...payload,
        items,
        prod_codes: items.map((i) => i.product.prod_code),
        totals,
        location: "001",
      },
      created_at: new Date(),
    };
  }

  return {
    status: 201,
    body: {
      message: persist
        ? "Mintpay checkout created"
        : "Mintpay hash generated (not saved)",
      order_id: checkout.order_id,
      amount: totals.netTotalWithoutCod.toFixed(2),
      checkout: {
        order_id: checkout.order_id,
        type: checkout.type,
        type_name: checkout.type_name,
        status: checkout.status,
        payload: checkout.payload,
        created_at: checkout.created_at,
      },
    },
  };
}

exports.createMintpayCheckout = async (req, res, next) => {
  try {
    const result = await processMintpayResponse(req.user.id, req.body, false);
    return res.status(result.status).json(result.body);
  } catch (e) {
    console.error("Mintpay Checkout Error:", e);
    next(e);
  }
};

exports.createPayHereHash = async (req, res, next) => {
  try {
    const { order_id } = req.body;

    // If order_id is provided, generate hash for existing record
    if (order_id) {
      const checkout = await Checkout.findOne({
        where: { order_id, user_id: req.user.id },
      });

      if (!checkout) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Parse payload to get amount
      let payload = checkout.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          return res.status(500).json({ message: "Invalid order payload" });
        }
      }

      const amountValue = payload.totals?.netTotalWithoutCod || 0;
      if (amountValue <= 0) {
        return res
          .status(400)
          .json({ message: "Order has invalid amount for payment" });
      }

      const amount = amountValue.toFixed(2);
      const hashPayload = buildPayHereHash(order_id, amount);

      if (hashPayload.error) {
        return res.status(500).json({ message: hashPayload.error });
      }

      return res.json({
        message: "PayHere hash generated for existing order",
        order_id: checkout.order_id,
        amount,
        currency: "LKR",
        merchant_id: process.env.PAYHERE_MERCHANT_ID,
        ...hashPayload,
      });
    }

    // Default flow: Generate hash for a new potential order
    const result = await createCardPaymentResponse(
      req.user.id,
      req.body,
      false,
    );
    return res.status(result.status).json(result.body);
  } catch (e) {
    console.error("PayHere Hash Error:", e);
    next(e);
  }
};

exports.listCheckouts = async (req, res, next) => {
  try {
    const [checkouts, pickAndCollects] = await Promise.all([
      Checkout.findAll({
        where: { user_id: req.user.id, payment_status: "success" },
        include: [
          {
            model: GiftReceiverDetail,
            as: "giftDetails",
            required: false,
          },
        ],
      }),
      PickAndCollect.findAll({
        where: { user_id: req.user.id, payment_status: "success" },
      }),
    ]);

    const normalizedCheckouts = checkouts.map((c) => {
      const item = c.toJSON ? c.toJSON() : c;

      // Parse payload if it's a string
      let payload = item.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          console.error(`[List] Failed to parse payload for ${item.order_id}`);
          payload = {};
        }
      }

      const totals = payload?.totals || {};

      const total = Number(totals.subTotal || 0);
      const courierCharge = Number(totals.courierCharge || 0);
      const codCharge = item.type === 2 ? Number(totals.codCharge || 0) : 0;

      const subTotal = total + courierCharge + codCharge;
      const discountAmount = Number(totals.discountAmount || 0);
      const netTotal = subTotal - discountAmount;

      const isGift = !!(
        payload?.isGift ||
        (item.giftDetails && item.giftDetails.id)
      );

      return {
        record_type: "checkout",
        order_id: item.order_id,
        type: item.type,
        type_name: item.type_name,
        payload: payload, // Return parsed payload for consistency
        total,
        sub_total: subTotal,
        net_total: netTotal,
        discount_amount: discountAmount,
        status: item.status,
        payment_status: item.payment_status,
        is_gift: isGift,
        gift_details: isGift ? item.giftDetails || null : null,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    const normalizedPickAndCollects = pickAndCollects.map((p) => {
      const item = p.toJSON ? p.toJSON() : p;
      const netAmount = Number(item.net_amount || 0);
      const discountAmount = Number(item.discount_amount || 0);
      const total = netAmount + discountAmount;

      return {
        record_type: "pick_and_collect",
        pick_and_collect_id: item.pick_and_collect_id,
        prod_code: item.prod_code,
        location: item.location,
        location_name: item.location_name,
        type: item.type,
        type_name: item.type_name,
        picked_qty: Number(item.picked_qty || 0),
        total,
        sub_total: total,
        net_total: netAmount,
        discount_amount: discountAmount,
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

exports.checkoutSuccess = async (req, res, next) => {
  try {
    const { order_id, type, t } = req.body;

    if (!order_id || !type) {
      return res
        .status(400)
        .json({ message: "order_id and type are required" });
    }

    const { Checkout, PickAndCollect, Cart, CartItem } = require("../models");

    let record = await Checkout.findOne({ where: { order_id } });
    let isPickAndCollect = false;

    if (!record) {
      record = await PickAndCollect.findOne({
        where: { pick_and_collect_id: order_id },
      });
      isPickAndCollect = true;
    }

    if (!record) {
      return res.status(404).json({ message: "Order not found" });
    }

    let success = false;
    let message = "";

    // Mapping based on user request: 1: COD, 2: PayHere, 3: Mintpay
    if (type === 1 || type === "1") {
      // COD - Only for Delivery (Checkout)
      if (isPickAndCollect) {
        success = false;
        message = "COD is not available for this Pick & Collect request";
      } else {
        success = true;
        message = "COD order confirmed successfully";
      }
    } else if (type === 2 || type === "2") {
      // PayHere - Frontend only calls this when payment is success
      success = true;
      message = "Payment successful";
    } else if (type === 3 || type === "3") {
      // Mintpay - Frontend passes t (true/false)
      if (t === true || t === "true") {
        success = true;
        message = "Mintpay payment successful";
      } else {
        success = false;
        message = "Mintpay payment failed or cancelled";
      }
    }

    if (success) {
      const wasAlreadyPaid = record.payment_status === "success";

      await record.update({
        payment_status: "success",
        updated_at: new Date(),
      });

      // Avoid duplicate actions if already processed by payment callbacks
      if (wasAlreadyPaid) {
        return res.json({
          success: true,
          message: "Order already confirmed",
          order_id: isPickAndCollect
            ? record.pick_and_collect_id
            : record.order_id,
          payment_status: "success",
        });
      }

      // Clear user cart upon successful Delivery checkout (not needed for P&C as it's direct)
      if (!isPickAndCollect) {
        const cart = await Cart.findOne({ where: { user_id: record.user_id } });
        if (cart) {
          await CartItem.destroy({ where: { cart_id: cart.id } });
        }

        // Send Confirmation Email & Notify Backoffice
        const user = await User.findOne({ where: { id: record.user_id } });
        if (user) {
          let payload = record.payload;
          if (typeof payload === "string") {
            try {
              payload = JSON.parse(payload);
            } catch (e) {
              payload = {};
            }
          }
          const items = payload.items || [];
          const totals = payload.totals || {};

          // Only send if not already successfully handled (to prevent duplicates)
          if (!wasAlreadyPaid) {
            await sendOrderConfirmationEmail(
              typeof user.toJSON === "function" ? user.toJSON() : user,
              typeof record.toJSON === "function" ? record.toJSON() : record,
              items,
            );
          }

          sendToTopic("backoffice", {
            title: "Order Payment Success",
            body: `Order #${record.order_id} payment confirmed.`,
            data: {
              notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
              order_id: String(record.order_id),
              user_id: String(record.user_id),
              customer_name: `${user.fname} ${user.lname}`.trim(),
              total: String(totals.netTotalWithoutCod || totals.subTotal || 0),
            },
          }).catch(console.error);
        }
      }

      return res.json({
        success: true,
        message,
        order_id: isPickAndCollect
          ? record.pick_and_collect_id
          : record.order_id,
        payment_status: "success",
      });
    } else {
      return res.status(400).json({
        success: false,
        message,
        order_id: isPickAndCollect
          ? record.pick_and_collect_id
          : record.order_id,
      });
    }
  } catch (error) {
    console.error("Checkout Success Error:", error);
    next(error);
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

        const unitPrice =
          (Number(pc.net_amount || 0) + Number(pc.discount_amount || 0)) /
          Number(pc.picked_qty || 1);

        checkoutObj = {
          order_id: pc.pick_and_collect_id,
          type: pc.type,
          type_name: pc.type_name || "pick & collect",
          status: pc.status,
          created_at: pc.created_at,
          payload: {
            prod_codes: [pc.prod_code],
            totals: {
              subTotal: unitPrice * (pc.picked_qty || 1),
              discountAmount: pc.discount_amount,
            },
          },
          discount_amount: pc.discount_amount,
          net_amount: pc.net_amount,
        };

        cartItems = [
          {
            product: product
              ? {
                  ...(typeof product.toJSON === "function"
                    ? product.toJSON()
                    : product),
                  selling_price: unitPrice,
                }
              : {
                  prod_code: pc.prod_code,
                  prod_name: "Product " + pc.prod_code,
                  selling_price: unitPrice,
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
