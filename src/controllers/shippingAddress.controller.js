const { ShippingAddress } = require("../models");

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  return String(value).trim();
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return null;
}

function serialize(row) {
  if (!row) return null;
  const item = row.toJSON ? row.toJSON() : row;
  return {
    is_gift: Boolean(item.is_gift),
    receiver_fname: item.receiver_fname,
    receiver_lname: item.receiver_lname,
    email: item.email || null,
    phone: item.phone,
    delivery_address: item.delivery_address,
    city: item.city,
    province: item.province,
    postal_code: item.postal_code,
    country: item.country,
    updated_at: item.updated_at || null,
  };
}

exports.getMyShippingAddress = async (req, res, next) => {
  try {
    const row = await ShippingAddress.findOne({ where: { user_id: req.user.id } });
    res.json({ shipping_address: serialize(row) });
  } catch (e) {
    next(e);
  }
};

exports.upsertMyShippingAddress = async (req, res, next) => {
  try {
    const body = req.body || {};
    const provinces = body.province ?? body.provinces;

    const payload = {
      is_gift: body.is_gift ?? body.gift ?? false,
      receiver_fname: normalizeString(body.receiver_fname ?? body.first_name),
      receiver_lname: normalizeString(body.receiver_lname ?? body.last_name),
      email: normalizeString(body.email),
      phone: normalizeString(body.phone),
      delivery_address: normalizeString(body.delivery_address ?? body.address),
      city: normalizeString(body.city),
      province: normalizeString(provinces),
      postal_code: normalizeString(body.postal_code),
      country: normalizeString(body.country),
    };

    const parsedGift = toBool(payload.is_gift);
    if (parsedGift === null) {
      return res.status(400).json({ message: "is_gift must be boolean" });
    }
    payload.is_gift = parsedGift;

    const requiredFields = [
      "receiver_fname",
      "receiver_lname",
      "phone",
      "delivery_address",
      "city",
      "province",
      "postal_code",
      "country",
    ];

    const missing = requiredFields.filter((key) => !payload[key]);
    if (missing.length) {
      return res.status(400).json({
        message: "Missing required fields",
        fields: missing,
      });
    }

    const now = new Date();
    const [row, created] = await ShippingAddress.findOrCreate({
      where: { user_id: req.user.id },
      defaults: {
        user_id: req.user.id,
        ...payload,
        created_at: now,
        updated_at: now,
      },
    });

    if (!created) {
      await row.update({ ...payload, updated_at: now });
    }

    const latest = created ? row : await ShippingAddress.findOne({ where: { user_id: req.user.id } });
    res.json({
      message: created ? "Shipping address created" : "Shipping address updated",
      shipping_address: serialize(latest),
    });
  } catch (e) {
    next(e);
  }
};
