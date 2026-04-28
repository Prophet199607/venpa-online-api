const {
  Cart,
  CartItem,
  Product,
  Coupon,
  CodValueCharge,
  CourierWeightCharge,
  Checkout,
  CouponUsage,
} = require("../models");
const { Op } = require("sequelize");

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

exports.applyCouponToCart = async (req, res, next) => {
  try {
    const { coupon_code } = req.body;
    if (!coupon_code) {
      return res.status(400).json({ message: "coupon_code is required" });
    }

    const userId = req.user.id;
    const cart = await getActiveCartWithProducts(userId);

    if (!cart) {
      return res.status(404).json({ message: "Active cart not found" });
    }

    let subTotal = 0;
    let totalWeight = 0;

    const items = cart.items || [];
    if (items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    items.forEach((item) => {
      const price = parseFloat(item?.product?.selling_price || 0);
      const weight = parseFloat(item?.product?.weight || 0);
      const quantity = parseInt(item?.quantity || 1, 10);
      subTotal += price * quantity;
      totalWeight += weight * quantity;
    });

    const coupon = await Coupon.findOne({
      where: { code: coupon_code.trim().toUpperCase(), is_active: true },
    });

    if (!coupon) {
      return res
        .status(400)
        .json({ message: "Invalid or inactive coupon code" });
    }

    // Check if user already used this coupon
    const usage = await CouponUsage.findOne({
      where: { user_id: userId, coupon_id: coupon.id },
    });
    if (usage) {
      return res
        .status(400)
        .json({ message: "You have already used this coupon code" });
    }

    // Order type validation
    const { order_type } = req.body; // e.g. 'cod', 'payhere'
    if (order_type === "cod" && !coupon.is_cod) {
      return res
        .status(400)
        .json({ message: "Coupon is not valid for Cash on Delivery" });
    }
    if (order_type === "payhere" && !coupon.is_card_payment) {
      return res
        .status(400)
        .json({ message: "Coupon is not valid for Card Payments" });
    }

    // Date validation
    const now = new Date();
    if (coupon.start_date && now < new Date(coupon.start_date)) {
      return res.status(400).json({ message: "Coupon is not yet active" });
    }
    if (coupon.end_date && now > new Date(coupon.end_date)) {
      return res.status(400).json({ message: "Coupon has expired" });
    }

    // Usage limit
    if (
      coupon.usage_limit !== null &&
      coupon.usage_count >= parseInt(coupon.usage_limit)
    ) {
      return res.status(400).json({ message: "Coupon usage limit reached" });
    }

    // Min order value
    if (subTotal < parseFloat(coupon.min_order_value || 0)) {
      return res.status(400).json({
        message: `Minimum order value of ${coupon.min_order_value} LKR required`,
      });
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

    discountAmount = Math.min(discountAmount, subTotal);

    // Calculate Charges
    const codChargeEntry = await CodValueCharge.findOne({
      where: {
        value_from: { [Op.lte]: subTotal },
        value_to: { [Op.gte]: subTotal },
      },
    });
    const codCharge = parseFloat(codChargeEntry?.charge || 0);

    const courierChargeEntry = await CourierWeightCharge.findOne({
      where: {
        weight_from: { [Op.lte]: totalWeight },
        weight_to: { [Op.gte]: totalWeight },
      },
    });
    const courierCharge = parseFloat(courierChargeEntry?.charge || 0);

    const netTotalWithCod =
      subTotal + courierCharge + codCharge - discountAmount;
    const netTotalWithOutCod = subTotal + courierCharge - discountAmount;

    res.json({
      message: "Coupon applied successfully",
      totals: {
        subTotal,
        totalWeight,
        codCharge,
        courierCharge,
        discountAmount,
        appliedCoupon: {
          code: coupon.code,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          amount: discountAmount,
        },
        netTotalWithCod,
        netTotalWithOutCod,
      },
    });
  } catch (e) {
    next(e);
  }
};

exports.applyCouponToPickAndCollect = async (req, res, next) => {
  try {
    const { coupon_code, prod_code, picked_qty } = req.body;
    if (!coupon_code) {
      return res.status(400).json({ message: "coupon_code is required" });
    }
    if (!prod_code || !picked_qty) {
      return res
        .status(400)
        .json({ message: "prod_code and picked_qty are required" });
    }

    const userId = req.user.id;
    const product = await Product.findOne({ where: { prod_code } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const qty = Number(picked_qty) || 1;
    const subTotal = Number(product.selling_price || 0) * qty;

    const coupon = await Coupon.findOne({
      where: { code: coupon_code.trim().toUpperCase(), is_active: true },
    });

    if (!coupon) {
      return res
        .status(400)
        .json({ message: "Invalid or inactive coupon code" });
    }

    // Check usage
    const usage = await CouponUsage.findOne({
      where: { user_id: userId, coupon_id: coupon.id },
    });
    if (usage) {
      return res
        .status(400)
        .json({ message: "You have already used this coupon code" });
    }

    if (!coupon.is_pick_and_collect) {
      return res
        .status(400)
        .json({ message: "Coupon is not valid for Pick & Collect" });
    }

    // Date validation
    const now = new Date();
    if (coupon.start_date && now < new Date(coupon.start_date)) {
      return res.status(400).json({ message: "Coupon is not yet active" });
    }
    if (coupon.end_date && now > new Date(coupon.end_date)) {
      return res.status(400).json({ message: "Coupon has expired" });
    }

    // Usage limit
    if (
      coupon.usage_limit !== null &&
      coupon.usage_count >= parseInt(coupon.usage_limit)
    ) {
      return res.status(400).json({ message: "Coupon usage limit reached" });
    }

    // Min order value
    if (subTotal < parseFloat(coupon.min_order_value || 0)) {
      return res.status(400).json({
        message: `Minimum order value of ${coupon.min_order_value} LKR required`,
      });
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

    discountAmount = Math.min(discountAmount, subTotal);
    const netTotal = subTotal - discountAmount;

    res.json({
      message: "Coupon applied successfully",
      totals: {
        subTotal,
        discountAmount,
        appliedCoupon: {
          code: coupon.code,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          amount: discountAmount,
        },
        netTotal,
      },
    });
  } catch (e) {
    next(e);
  }
};
