const crypto = require("crypto");
const { Op } = require("sequelize");
const {
  PickAndCollect,
  Product,
  Location,
  StockMaster,
  User,
  sequelize,
} = require("../models");
const { enrichProducts } = require("../services/products/enrichProducts");
const {
  sendToTopic,
} = require("../services/notifications/notificationService");
const {
  NOTIFICATION_TYPES,
} = require("../services/notifications/notificationTypes");

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeKey(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeQuantity(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(3));
}

function normalizePickAndCollectType(value) {
  if (value === 1 || value === "1") return 1;
  if (value === 2 || value === "2") return 2;
  return null;
}

function generatePickAndCollectId() {
  return Number(
    `${Date.now()}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")}`,
  );
}

function buildPayHereHash(pickAndCollectId, amount) {
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
    .update(`${merchantId}${pickAndCollectId}${amount}${currency}${secretHash}`)
    .digest("hex")
    .toUpperCase();

  return {
    pick_and_collect_id: pickAndCollectId,
    amount,
    currency,
    merchant_id: merchantId,
    hash,
  };
}

async function getAvailableQty(prodCode, location) {
  const row = await StockMaster.findOne({
    where: {
      prod_code: prodCode,
      location,
    },
    attributes: [[sequelize.fn("SUM", sequelize.col("qty")), "available_qty"]],
    raw: true,
  });

  return Number(row?.available_qty || 0);
}

function buildStockKey(prodCode, location) {
  return `${normalizeKey(prodCode)}::${normalizeKey(location)}`;
}

async function serializeRows(rows) {
  if (!rows.length) return [];

  const prodCodes = [
    ...new Set(
      rows.map((row) => normalizeString(row.prod_code)).filter(Boolean),
    ),
  ];
  const locationCodes = [
    ...new Set(
      rows.map((row) => normalizeString(row.location)).filter(Boolean),
    ),
  ];

  const [productRows, locationRows, stockRows] = await Promise.all([
    prodCodes.length
      ? Product.findAll({
          where: { prod_code: { [Op.in]: prodCodes } },
          order: [["id", "DESC"]],
        })
      : Promise.resolve([]),
    locationCodes.length
      ? Location.findAll({
          where: { loca_code: { [Op.in]: locationCodes } },
          raw: true,
        })
      : Promise.resolve([]),
    prodCodes.length && locationCodes.length
      ? StockMaster.findAll({
          where: {
            prod_code: { [Op.in]: prodCodes },
            location: { [Op.in]: locationCodes },
          },
          attributes: [
            "prod_code",
            "location",
            [sequelize.fn("SUM", sequelize.col("qty")), "available_qty"],
          ],
          group: ["prod_code", "location"],
          raw: true,
        })
      : Promise.resolve([]),
  ]);

  const enrichedProducts = await enrichProducts(productRows);
  const productMap = new Map(
    enrichedProducts.map((product) => [
      normalizeKey(product.prod_code),
      product,
    ]),
  );
  const locationMap = new Map(
    locationRows.map((location) => [
      normalizeKey(location.loca_code),
      location,
    ]),
  );
  const stockMap = new Map(
    stockRows.map((item) => [
      buildStockKey(item.prod_code, item.location),
      Number(item.available_qty || 0),
    ]),
  );

  return rows.map((row) => {
    const item = row.toJSON ? row.toJSON() : row;
    const normalizedProdCode = normalizeKey(item.prod_code);
    const normalizedLocation = normalizeKey(item.location);

    return {
      id: item.id,
      pick_and_collect_id: item.pick_and_collect_id,
      prod_code: item.prod_code,
      location: item.location,
      location_name: item.location_name,
      type: Number(item.type || 0),
      type_name: item.type_name,
      picked_qty: Number(item.picked_qty || 0),
      status: item.status,
      created_at: item.created_at || null,
      updated_at: item.updated_at || null,
      product: normalizedProdCode
        ? productMap.get(normalizedProdCode) || null
        : null,
      location_details: normalizedLocation
        ? locationMap.get(normalizedLocation) || null
        : null,
      available_qty:
        normalizedProdCode && normalizedLocation
          ? Number(
              stockMap.get(
                buildStockKey(normalizedProdCode, normalizedLocation),
              ) || 0,
            )
          : 0,
    };
  });
}

async function validatePickAndCollectPayload(body) {
  const prodCode = normalizeString(body.prod_code ?? body.product_code);
  const locationCode = normalizeString(
    body.location ?? body.loca_code ?? body.location_code,
  );
  const type = normalizePickAndCollectType(body.type);
  const pickedQty = normalizeQuantity(
    body.picked_qty ?? body.qty ?? body.quantity,
  );

  const missingFields = [];
  if (!prodCode) missingFields.push("prod_code");
  if (!locationCode) missingFields.push("location");
  if (type === null) missingFields.push("type");
  if (pickedQty === null) missingFields.push("picked_qty");

  if (missingFields.length) {
    return {
      error: {
        status: 400,
        body: {
          message: "Missing or invalid required fields",
          fields: missingFields,
        },
      },
    };
  }

  const [product, location] = await Promise.all([
    Product.findOne({ where: { prod_code: prodCode } }),
    Location.findOne({
      where: { loca_code: locationCode, is_active: 1 },
      raw: true,
    }),
  ]);

  if (!product) {
    return { error: { status: 404, body: { message: "Product not found" } } };
  }

  if (!location) {
    return {
      error: {
        status: 404,
        body: { message: "Location not found or inactive" },
      },
    };
  }

  const availableQty = await getAvailableQty(prodCode, locationCode);
  if (availableQty <= 0) {
    return {
      error: {
        status: 400,
        body: {
          message: "Selected location has no available stock for this product",
        },
      },
    };
  }

  if (pickedQty > availableQty) {
    return {
      error: {
        status: 400,
        body: {
          message:
            "picked_qty exceeds available stock at the selected location",
          available_qty: availableQty,
        },
      },
    };
  }

  return {
    prodCode,
    locationCode,
    type,
    pickedQty,
    product,
    location,
    availableQty,
  };
}

async function createPickAndCollectResponse(userId, body, forcedType = null) {
  const normalizedBody =
    forcedType === null ? body : { ...(body || {}), type: forcedType };
  const validated = await validatePickAndCollectPayload(normalizedBody || {});
  if (validated.error) {
    return validated.error;
  }

  const { prodCode, locationCode, type, pickedQty, product, location } =
    validated;

  const pickAndCollectId = generatePickAndCollectId();
  const now = new Date();

  if (type === 1) {
    const amountValue = Number(product?.selling_price || 0) * pickedQty;
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return {
        status: 400,
        body: { message: "Product has invalid pricing for PayHere payment" },
      };
    }

    const amount = amountValue.toFixed(2);
    const hashPayload = buildPayHereHash(pickAndCollectId, amount);
    if (hashPayload.error) {
      return { status: 500, body: { message: hashPayload.error } };
    }

    const row = await PickAndCollect.create({
      pick_and_collect_id: pickAndCollectId,
      user_id: userId,
      prod_code: prodCode,
      location: locationCode,
      location_name: location.loca_name,
      type,
      type_name: "pick & collect",
      picked_qty: pickedQty,
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    const [serialized] = await serializeRows([row]);

    // Notify Backoffice
    User.findByPk(userId).then((user) => {
      if (user) {
        sendToTopic("backoffice", {
          title: "New Pick & Collect Order",
          body: `${product?.prod_name} at ${location.loca_name}`,
          data: {
            notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
            pick_and_collect_id: String(pickAndCollectId),
            user_id: String(userId),
            customer_name: `${user.fname} ${user.lname}`.trim(),
            product_name: product?.prod_name,
            location: location.loca_name,
          },
        }).catch(console.error);
      }
    });

    return {
      status: 201,
      body: {
        message: "PayHere hash generated",
        pick_and_collect: serialized,
        ...hashPayload,
      },
    };
  }

  const row = await PickAndCollect.create({
    pick_and_collect_id: pickAndCollectId,
    user_id: userId,
    prod_code: prodCode,
    location: locationCode,
    location_name: location.loca_name,
    type,
    type_name: "pick & collect",
    picked_qty: pickedQty,
    status: "pending",
    created_at: now,
    updated_at: now,
  });

  const [serialized] = await serializeRows([row]);

  // Notify Backoffice
  User.findByPk(userId).then((user) => {
    if (user) {
      sendToTopic("backoffice", {
        title: "New Pick & Collect Order",
        body: `${product?.prod_name} at ${location.loca_name}`,
        data: {
          notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
          pick_and_collect_id: String(pickAndCollectId),
          user_id: String(userId),
          customer_name: `${user.fname} ${user.lname}`.trim(),
          product_name: product?.prod_name,
          location: location.loca_name,
        },
      }).catch(console.error);
    }
  });

  return {
    status: 201,
    body: {
      message: "Pick and collect request created",
      pick_and_collect: serialized,
    },
  };
}

exports.listMyPickAndCollects = async (req, res, next) => {
  try {
    const where = { user_id: req.user.id };
    const status = normalizeString(req.query.status);
    if (status) {
      where.status = status;
    }

    const rows = await PickAndCollect.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    res.json({
      items: await serializeRows(rows),
    });
  } catch (e) {
    next(e);
  }
};

exports.createPickAndCollect = async (req, res, next) => {
  try {
    const result = await createPickAndCollectResponse(req.user.id, req.body);
    return res.status(result.status).json(result.body);
  } catch (e) {
    next(e);
  }
};

exports.createPickAndCollectPayHereHash = async (req, res, next) => {
  try {
    const result = await createPickAndCollectResponse(req.user.id, req.body, 1);
    return res.status(result.status).json(result.body);
  } catch (e) {
    next(e);
  }
};
