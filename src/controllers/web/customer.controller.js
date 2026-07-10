const { Op, fn, col, literal } = require("sequelize");
const { User, Checkout, PickAndCollect, Product } = require("../../models");
const sequelizeSource = require("../../config/sourceDb");

/**
 * GET /users
 * Returns all registered users with their order summary.
 * Each user includes: total_orders, total_checkouts, total_pick_and_collects,
 * last_order_at, and last_order_status.
 */
exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ["password"] },
      order: [["id", "ASC"]],
    });

    if (!users.length) return res.json([]);

    const userIds = users.map((u) => u.id);

    // ── Fetch all checkouts ───────────────────────────────────────────────
    const checkouts = await Checkout.findAll({
      where: { user_id: { [Op.in]: userIds } },
      attributes: [
        "user_id",
        "order_id",
        "status",
        "payment_status",
        "created_at",
      ],
      order: [["created_at", "DESC"]],
    });

    // ── Fetch all pick-and-collects ───────────────────────────────────────
    const pickAndCollects = await PickAndCollect.findAll({
      where: { user_id: { [Op.in]: userIds } },
      attributes: [
        "user_id",
        "pick_and_collect_id",
        "status",
        "payment_status",
        "created_at",
      ],
      order: [["created_at", "DESC"]],
    });

    // ── Build maps ────────────────────────────────────────────────────────
    const checkoutMap = {};
    checkouts.forEach((c) => {
      const cj = c.toJSON ? c.toJSON() : c;

      if (!checkoutMap[cj.user_id]) {
        checkoutMap[cj.user_id] = [];
      }

      checkoutMap[cj.user_id].push(cj);
    });

    const pacMap = {};
    pickAndCollects.forEach((p) => {
      const pj = p.toJSON ? p.toJSON() : p;

      if (!pacMap[pj.user_id]) {
        pacMap[pj.user_id] = [];
      }

      pacMap[pj.user_id].push(pj);
    });

    // ── Merge user data with order summary ────────────────────────────────
    const result = users.map((u) => {
      const uj = u.toJSON ? u.toJSON() : u;

      const userCheckouts = checkoutMap[uj.id] || [];
      const userPacs = pacMap[uj.id] || [];

      const totalCheckouts = userCheckouts.length;
      const totalPacs = userPacs.length;
      const totalOrders = totalCheckouts + totalPacs;

      // Check if user has any successful payment
      const hasSuccessPayment =
        userCheckouts.some(
          (c) =>
            c.payment_status &&
            c.payment_status.toLowerCase() === "success"
        ) ||
        userPacs.some(
          (p) =>
            p.payment_status &&
            p.payment_status.toLowerCase() === "success"
        );

      // Find most recent order
      const allOrders = [
        ...userCheckouts.map((c) => ({
          date: c.created_at,
          status: c.status,
        })),
        ...userPacs.map((p) => ({
          date: p.created_at,
          status: p.status,
        })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      const lastOrder = allOrders[0] || null;

      return {
        ...uj,
        total_orders: totalOrders,
        total_checkouts: totalCheckouts,
        total_pick_and_collects: totalPacs,
        last_order_at: lastOrder?.date || null,
        last_order_status: lastOrder?.status || null,
        has_success_payment: hasSuccessPayment,
      };
    });

    res.json({
      total_users: result.length,
      users: result,
      successful: true,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /users/by-date
 * Returns users registered on a specific date.
 * Query param: date (e.g., 2023-10-25)
 */
exports.getUsersByDate = async (req, res, next) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "date query parameter is required (format: YYYY-MM-DD)" });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const users = await User.findAll({
      where: {
        created_at: {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        },
      },
      attributes: { exclude: ["password"] },
      order: [["id", "ASC"]],
    });

    res.json({
      total_users: users.length,
      users,
      successful: true,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Safely parse payload — Sequelize JSON columns are usually already parsed,
 * but guard against cases where they arrive as a raw string.
 */
function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

/**
 * GET /users/:id/order-products
 * Returns a flat list of all products the user has ordered,
 * grouped by order — covering both checkouts and pick-and-collects.
 *
 * DB payload structure (from screenshot):
 *   { coupon_code, isGift, items: [ { product: { prod_code, prod_name, selling_price, prod_image, ... }, quantity: 1 }, ... ] }
 */
exports.getUserOrderProducts = async (req, res, next) => {
  try {
    const { id } = req.params;

    // ── Verify user exists ──────────────────────────────────────────────────
    const user = await User.findOne({
      where: { id },
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const result = [];

    // ── 1. Checkout orders ──────────────────────────────────────────────────
    const checkouts = await Checkout.findAll({
      where: { user_id: id },
      order: [["created_at", "DESC"]],
    });

    for (const checkout of checkouts) {
      const json = checkout.toJSON ? checkout.toJSON() : checkout;

      // Parse payload safely — handles both string and object
      const payload = parsePayload(json.payload);

      // Payload structure: { items: [ { product: {...}, quantity: 1 } ] }
      // Also handle legacy: direct array or array at root
      let lines = [];
      if (Array.isArray(payload)) {
        lines = payload;
      } else if (Array.isArray(payload.items)) {
        lines = payload.items;
      }

      // Each line has: { product: { prod_code, prod_name, selling_price, prod_image }, quantity }
      // Extract prod_codes — support both structures just in case
      const prodCodes = [
        ...new Set(
          lines
            .map((l) => l?.product?.prod_code || l?.prod_code)
            .filter(Boolean)
        ),
      ];

      // Fetch fresh product data from DB (has up-to-date image URLs etc.)
      const dbProducts = prodCodes.length
        ? await Product.findAll({
            where: { prod_code: { [Op.in]: prodCodes } },
          })
        : [];

      const productMap = {};
      dbProducts.forEach((p) => {
        const pj = p.toJSON ? p.toJSON() : p;
        productMap[pj.prod_code] = pj;
      });

      // Build product list — merge snapshot data from payload + live DB data
      const orderProducts = lines.map((line) => {
        const snapshot = line?.product || {};
        const prodCode = snapshot.prod_code || line?.prod_code || null;
        const db = productMap[prodCode] || {};

        return {
          prod_code:     prodCode,
          prod_name:     db.prod_name     || snapshot.prod_name     || null,
          prod_image:    db.prod_image    || snapshot.prod_image    || null,
          quantity:      line.quantity    ?? line.qty               ?? null,
          selling_price: db.selling_price ?? snapshot.selling_price ?? null,
          marked_price:  db.marked_price  ?? snapshot.marked_price  ?? null,
          discount:      db.discount      ?? snapshot.discount      ?? null,
          dis_per:       db.dis_per       ?? snapshot.dis_per       ?? null,
          department:    db.department    || snapshot.department    || null,
          category:      db.category      || snapshot.category      || null,
          sub_category:  db.sub_category  || snapshot.sub_category  || null,
          status:        db.status        ?? null,
        };
      });

      result.push({
        record_type:    "checkout",
        order_id:       json.order_id,
        type:           json.type,
        type_name:      json.type_name,
        order_status:   json.status,
        payment_status: json.payment_status,
        created_at:     json.created_at,
        updated_at:     json.updated_at,
        products:       orderProducts,
      });
    }

    // ── 2. Pick-and-collect orders ──────────────────────────────────────────
    const pickAndCollects = await PickAndCollect.findAll({
      where: { user_id: id },
      order: [["created_at", "DESC"]],
    });

    for (const pac of pickAndCollects) {
      const json = pac.toJSON ? pac.toJSON() : pac;

      const product = json.prod_code
        ? await Product.findOne({ where: { prod_code: json.prod_code } })
        : null;

      const pj = product ? (product.toJSON ? product.toJSON() : product) : null;

      result.push({
        record_type:    "pick_and_collect",
        order_id:       json.pick_and_collect_id,
        type:           json.type,
        type_name:      json.type_name,
        location:       json.location,
        location_name:  json.location_name,
        order_status:   json.status,
        payment_status: json.payment_status,
        created_at:     json.created_at,
        updated_at:     json.updated_at,
        products: [
          {
            prod_code:     json.prod_code,
            prod_name:     pj?.prod_name     || null,
            prod_image:    pj?.prod_image    || null,
            quantity:      json.picked_qty,
            selling_price: pj?.selling_price ?? null,
            marked_price:  pj?.marked_price  ?? null,
            discount:      pj?.discount      ?? null,
            dis_per:       pj?.dis_per       ?? null,
            department:    pj?.department    || null,
            category:      pj?.category      || null,
            sub_category:  pj?.sub_category  || null,
            status:        pj?.status        ?? null,
          },
        ],
      });
    }

    // ── Sort all orders newest first ────────────────────────────────────────
    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      user,
      total_orders: result.length,
      orders: result,
      successful: true,
    });
  } catch (e) {
    next(e);
  }
};