const { QueryTypes, Op } = require("sequelize");
const { sequelize, EmailVerification, User } = require("../models");

async function safeCount(table, column, userId) {
  try {
    const rows = await sequelize.query(
      `SELECT COUNT(*) as count FROM \`${table}\` WHERE \`${column}\` = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT },
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
      }).catch(() => null),
    ]);

    const userResponse = user;

    res.json({
      user: {
        id: userResponse.id,
        fname: userResponse.fname || "",
        lname: userResponse.lname || "",
        email: userResponse.email || "",
        phone: userResponse.phone || "",
        country: userResponse.country || null,
        address: userResponse.address || null,
        city: userResponse.city || null,
        province: userResponse.province || null,
        postal_code: userResponse.postal_code || null,
        status: userResponse.status,
        email_verified: Boolean(verification),
      },
      stats: {
        orders: orderCount,
        reviews: reviewCount,
        points: 0,
      },
    });
  } catch (e) {
    next(e);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const payload = req.body || {};
    const has = (key) => Object.prototype.hasOwnProperty.call(payload, key);
    const provinces = has("province") ? payload.province : payload.provinces;
    const userAttrs = req.user.constructor?.rawAttributes || {};
    const supports = (attr) => Boolean(userAttrs[attr]);

    const normalizePhone = (phone) => {
      let digits = String(phone || "").replace(/\D/g, "");

      if (digits.startsWith("0") && digits.length === 10) {
        digits = "94" + digits.slice(1);
      } else if (digits.length === 9) {
        digits = "94" + digits;
      }

      // final validation
      if (!/^94\d{9}$/.test(digits)) {
        return null;
      }

      return digits;
    };

    if (
      !has("fname") &&
      !has("lname") &&
      !has("phone") &&
      !has("country") &&
      !has("address") &&
      !has("city") &&
      !has("province") &&
      !has("provinces") &&
      !has("postal_code") &&
      !has("email")
    ) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updates = {};
    if (has("email")) {
      const newEmail = String(payload.email || "")
        .trim()
        .toLowerCase();
      if (newEmail && newEmail !== req.user.email) {
        const existing = await User.findOne({
          where: { email: newEmail, id: { [Op.ne]: req.user.id } },
        });
        if (existing) {
          return res.status(400).json({ message: "Email already in use" });
        }
        updates.email = newEmail;
      }
    }
    if (has("fname")) updates.fname = payload.fname;
    if (has("lname")) updates.lname = payload.lname;
    if (has("phone")) {
      const newPhone = normalizePhone(payload.phone);

      if (!newPhone) {
        return res.status(400).json({
          message: "Invalid phone number",
        });
      }

      const currentPhone = normalizePhone(req.user.phone);

      if (newPhone && newPhone !== currentPhone) {
        const existing = await User.findOne({
          where: {
            phone: newPhone,
            id: { [Op.ne]: req.user.id },
          },
        });

        if (existing) {
          return res.status(400).json({
            message: "Phone number already in use",
          });
        }

        updates.phone = newPhone;
      }
    }
    if (has("country") && supports("country"))
      updates.country = payload.country;
    if (has("address") && supports("address"))
      updates.address = payload.address;
    if (has("city") && supports("city")) updates.city = payload.city;
    if ((has("province") || has("provinces")) && supports("province"))
      updates.province = provinces;
    if (has("postal_code") && supports("postal_code"))
      updates.postal_code = payload.postal_code;

    await req.user.update(updates);

    const user = req.user.toJSON();
    delete user.password;

    const userResponse = user;
// Sync updated profile to CRM_Customer
try {
  const updatedUser = req.user.toJSON();
  const sourceSequelize = require("../config/sourceDb");
  const { QueryTypes: QT } = require("sequelize");
  const now = new Date();

  const crmExisting = await sourceSequelize.query(
    `SELECT Id_No, U_ID FROM CRM_Customer WHERE E_mail = :email OR Mobile = :phone LIMIT 1`,
    {
      replacements: {
        email: updatedUser.email || null,
        phone: updatedUser.phone || null,
      },
      type: QT.SELECT,
    }
  );

  if (crmExisting.length > 0) {
    await sourceSequelize.query(
      `UPDATE CRM_Customer SET
        Cus_Name  = :cusName,
        Mobile    = :mobile,
        E_mail    = :email,
        ModDate   = :modDate
      WHERE U_ID = :uId`,
      {
        replacements: {
          uId:     crmExisting[0].U_ID,
          cusName: `${updatedUser.fname || ""} ${updatedUser.lname || ""}`.trim() || updatedUser.email || updatedUser.phone || "Guest",
          mobile:  updatedUser.phone || null,
          email:   updatedUser.email || null,
          modDate: now,
        },
        type: QT.UPDATE,
      }
    );
    console.log("[CRM Sync] Profile update synced ✅");
  } else {
    console.log("[CRM Sync] No CRM record found for this user — skipping update");
  }
} catch (crmErr) {
  console.error("[CRM Sync Error] Profile update:", crmErr.message);
}
    res.json({
      message: "Profile updated",
      user: {
        id: userResponse.id,
        fname: userResponse.fname || "",
        lname: userResponse.lname || "",
        email: userResponse.email || "",
        phone: userResponse.phone || "",
        country: userResponse.country || null,
        address: userResponse.address || null,
        city: userResponse.city || null,
        province: userResponse.province || null,
        postal_code: userResponse.postal_code || null,
        status: userResponse.status,
      },
    });
  } catch (e) {
    next(e);
  }
};
