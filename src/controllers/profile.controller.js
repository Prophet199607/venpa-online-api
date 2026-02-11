const { QueryTypes, Op } = require("sequelize");
const { sequelize, EmailVerification } = require("../models");

async function safeCount(table, column, userId) {
  try {
    const rows = await sequelize.query(
      `SELECT COUNT(*) as count FROM \`${table}\` WHERE \`${column}\` = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    return Number(rows?.[0]?.count || 0);
  } catch (err) {
    console.warn(`Profile count skipped for ${table}.${column}:`, err.message);
    return 0;
  }
}

exports.getProfileSummary = async (req, res, next) => {
  try {
    const user = req.user.toJSON();
    delete user.password;

    const ordersTable = process.env.ORDERS_TABLE || "orders";
    const ordersUserColumn = process.env.ORDERS_USER_COLUMN || "user_id";
    const reviewsTable = process.env.REVIEWS_TABLE || "reviews";
    const reviewsUserColumn = process.env.REVIEWS_USER_COLUMN || "user_id";

    const [orderCount, reviewCount, verification] = await Promise.all([
      safeCount(ordersTable, ordersUserColumn, req.user.id),
      safeCount(reviewsTable, reviewsUserColumn, req.user.id),
      EmailVerification.findOne({
        where: { user_id: req.user.id, verified_at: { [Op.ne]: null } },
        order: [["verified_at", "DESC"]],
      }).catch(() => null)
    ]);

    res.json({
      user: {
        id: user.id,
        fname: user.fname,
        lname: user.lname,
        email: user.email,
        phone: user.phone,
        country: user.country || null,
        address: user.address || null,
        city: user.city || null,
        province: user.province || null,
        postal_code: user.postal_code || null,
        status: user.status,
        email_verified: Boolean(verification)
      },
      stats: {
        orders: orderCount,
        reviews: reviewCount,
        points: 0
      }
    });
  } catch (e) { next(e); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const payload = req.body || {};
    const has = (key) => Object.prototype.hasOwnProperty.call(payload, key);
    const provinces = has("province") ? payload.province : payload.provinces;

    if (
      !has("fname") &&
      !has("lname") &&
      !has("phone") &&
      !has("country") &&
      !has("address") &&
      !has("city") &&
      !has("province") &&
      !has("provinces") &&
      !has("postal_code")
    ) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updates = {};
    if (has("fname")) updates.fname = payload.fname;
    if (has("lname")) updates.lname = payload.lname;
    if (has("phone")) updates.phone = payload.phone;
    if (has("country")) updates.country = payload.country;
    if (has("address")) updates.address = payload.address;
    if (has("city")) updates.city = payload.city;
    if (has("province") || has("provinces")) updates.province = provinces;
    if (has("postal_code")) updates.postal_code = payload.postal_code;

    await req.user.update(updates);

    const user = req.user.toJSON();
    delete user.password;

    res.json({
      message: "Profile updated",
      user: {
        id: user.id,
        fname: user.fname,
        lname: user.lname,
        email: user.email,
        phone: user.phone,
        country: user.country || null,
        address: user.address || null,
        city: user.city || null,
        province: user.province || null,
        postal_code: user.postal_code || null,
        status: user.status,
      },
    });
  } catch (e) { next(e); }
};
