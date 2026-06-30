const axios = require("axios");
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

    const crmPayload = {
      card_no: "",
      city: user.city || "",
      cus_code: "",
      cus_name: `${user.fname || ""} ${user.lname || ""}`.trim(),
      cust_group: "WEB",
      cust_status: "1",
      cust_type: "WEB",
      dob: "",
      email: user.email || "",
      insert_user: "SYNC_ADMIN",
      loca: "03",
      mobile: user.phone || "",
      nic_number: "",
    };

    const authString = Buffer.from("onimta:2302").toString("base64");

    console.log("[CRM] Sending payload:", JSON.stringify(crmPayload));

    let crmData = null;
    try {
      const crmResponse = await axios.post(
        "https://crmapi.venpaa.lk/crm/customers/pos",
        crmPayload,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Basic ${authString}`,
          },
          validateStatus: () => true, // never throw — we check status manually below
        },
      );

      crmData = crmResponse.data || {};
      const crmHttpOk = crmResponse.status >= 200 && crmResponse.status < 300;
      const crmBodyOk =
        crmData.success === true || crmData.success === undefined;

      // Only respond with success if both the local update and CRM sync succeeded
      if (!crmHttpOk || !crmBodyOk) {
        console.warn(
          `[CRM] POST failed — HTTP ${crmResponse?.status}, body:`,
          JSON.stringify(crmData),
          `. Attempting PUT update...`
        );

        const putPayload = {
          card_no: "",
          city: user.city || "",
          cus_name: `${user.fname || ""} ${user.lname || ""}`.trim(),
          dob: "",
          email: user.email || "",
          insert_user: "SYNC_ADMIN",
          mobile: user.phone || "",
          nic_number: "",
        };

        const putResponse = await axios.put(
          "https://crmapi.venpaa.lk/crm/customers/pos",
          putPayload,
          {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Basic ${authString}`,
            },
            validateStatus: () => true,
          },
        );

        crmData = putResponse.data || {};
        const putHttpOk = putResponse.status >= 200 && putResponse.status < 300;
        const putBodyOk =
          crmData.success === true || crmData.success === undefined;

        if (!putHttpOk || !putBodyOk) {
          console.warn(
            `[CRM] PUT failed — HTTP ${putResponse?.status}, body:`,
            JSON.stringify(crmData),
          );
          return res.status(502).json({
            message: "Profile updated locally but failed to sync with CRM",
            post_error: crmResponse?.data || null,
            put_error: putResponse?.data || null,
            crm_error: crmData?.message || "Customer update failed",
          });
        }
      }
    } catch (crmErr) {
      console.error("[CRM] Sync error:", crmErr.message);
      return res.status(502).json({
        message: "Profile updated locally but failed to sync with CRM",
        crm_error: crmErr.message,
      });
    }

    delete user.password;

    const userResponse = user;

    res.json({
      message: "Profile updated",
      crm: crmData,
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
