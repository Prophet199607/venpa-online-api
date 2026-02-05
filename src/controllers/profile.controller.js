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
    const { fname, lname } = req.body || {};

    if (!fname && !lname) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updates = {};
    if (fname) updates.fname = fname;
    if (lname) updates.lname = lname;

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
        status: user.status,
      },
    });
  } catch (e) { next(e); }
};
