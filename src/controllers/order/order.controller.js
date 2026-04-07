const {
  Checkout,
  User,
  DeviceToken,
  PickAndCollect,
  Product,
} = require("../../models");

exports.getAllOrders = async (req, res, next) => {
  try {
    const { status, device, order_type } = req.query;

    const userInclude = {
      model: User,
      attributes: ["id", "fname", "lname", "email", "phone"],
      include: [],
    };

    if (device) {
      userInclude.required = true;
      userInclude.include.push({
        model: DeviceToken,
        where: { platform: device },
        attributes: ["platform"],
        required: true,
      });
    } else {
      userInclude.include.push({
        model: DeviceToken,
        attributes: ["platform"],
        required: false,
      });
    }

    let checkouts = [];
    let pickAndCollects = [];

    // Fetch Delivery Orders (Checkouts)
    if (!order_type || order_type === "delivery") {
      const checkoutWhere = {};
      if (status) checkoutWhere.status = status;

      checkouts = await Checkout.findAll({
        where: checkoutWhere,
        include: [userInclude],
        order: [["id", "DESC"]],
      });
    }

    // Fetch Pick & Collect Orders
    if (!order_type || order_type === "pick_and_collect") {
      const pcWhere = {};
      if (status) pcWhere.status = status;

      pickAndCollects = await PickAndCollect.findAll({
        where: pcWhere,
        include: [
          userInclude,
          {
            model: Product,
            as: "product",
            attributes: ["prod_name", "selling_price", "prod_code"],
          },
        ],
        order: [["id", "DESC"]],
      });
    }

    // Format Checkouts
    const formattedCheckouts = checkouts.map((order) => {
      const json = order.toJSON ? order.toJSON() : order;
      const result = {
        record_type: "delivery",
        ...json,
      };

      if (json.user) {
        result.customer_name =
          `${json.user.fname || ""} ${json.user.lname || ""}`.trim();

        let platformVal = null;
        const tokens = json.user.device_tokens || json.user.DeviceTokens || [];
        if (tokens.length > 0) {
          platformVal = tokens[0].platform;
        }
        if (device) platformVal = device;

        result.device = Number(platformVal) || null;
        if (result.device === 1) result.source = "App";
        else if (result.device === 2) result.source = "Web";
        else result.source = "Unknown";

        delete result.user.device_tokens;
        delete result.user.DeviceTokens;
      } else {
        result.customer_name = "N/A";
        result.source = "Unknown";
      }
      return result;
    });

    // Format Pick & Collects
    const formattedPCs = pickAndCollects.map((pc) => {
      const json = pc.toJSON ? pc.toJSON() : pc;
      const productData = json.product || {
        prod_name: "Unknown",
        selling_price: 0,
        prod_code: json.prod_code,
      };

      const result = {
        record_type: "pick_and_collect",
        order_id: json.pick_and_collect_id,
        ...json,
      };

      if (json.user) {
        result.customer_name =
          `${json.user.fname || ""} ${json.user.lname || ""}`.trim();

        let platformVal = null;
        const tokens = json.user.device_tokens || json.user.DeviceTokens || [];
        if (tokens.length > 0) {
          platformVal = tokens[0].platform;
        }
        if (device) platformVal = device;

        result.device = Number(platformVal) || null;
        if (result.device === 1) result.source = "App";
        else if (result.device === 2) result.source = "Web";
        else result.source = "Unknown";

        delete result.user.device_tokens;
        delete result.user.DeviceTokens;
      } else {
        result.customer_name = "N/A";
        result.source = "Unknown";
      }

      // Add simple summary for the list
      result.total_items = 1;
      result.amount =
        (parseFloat(productData.selling_price) || 0) *
        (parseFloat(json.picked_qty) || 1);

      return result;
    });

    // Combine and Sort
    const combined = [...formattedCheckouts, ...formattedPCs].sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    });

    const finalResults = [];
    const seen = new Set();
    for (const item of combined) {
      const key = `${item.record_type}_${item.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        finalResults.push(item);
      }
    }

    res.json(finalResults);
  } catch (e) {
    next(e);
  }
};

exports.getOrderById = async (req, res, next) => {
  try {
    const { order_id: rawOrderId } = req.params;
    const orderIdValue = isNaN(Number(rawOrderId))
      ? rawOrderId
      : Number(rawOrderId);

    // 1. Try Checkout table
    let checkout = await Checkout.findOne({
      where: { order_id: orderIdValue },
      include: [
        {
          model: User,
          attributes: [
            "id",
            "fname",
            "lname",
            "email",
            "phone",
            "country",
            "address",
            "city",
            "province",
            "postal_code",
          ],
          include: [
            {
              model: DeviceToken,
              attributes: ["platform"],
              required: false,
            },
          ],
        },
      ],
    });

    if (checkout) {
      const json = checkout.toJSON ? checkout.toJSON() : checkout;
      let payload = json.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (e) {}
      }

      let source = "Unknown";
      let device = null;
      if (
        json.user &&
        json.user.device_tokens &&
        json.user.device_tokens.length > 0
      ) {
        device = Number(json.user.device_tokens[0].platform);
        if (device === 1) source = "App";
        else if (device === 2) source = "Web";
      } else if (
        json.user &&
        json.user.DeviceTokens &&
        json.user.DeviceTokens.length > 0
      ) {
        device = Number(json.user.DeviceTokens[0].platform);
        if (device === 1) source = "App";
        else if (device === 2) source = "Web";
      }

      if (json.user) {
        json.customer_name =
          `${json.user.fname || ""} ${json.user.lname || ""}`.trim();
        delete json.user.device_tokens;
        delete json.user.DeviceTokens;
      }

      return res.json({
        record_type: "checkout",
        id: json.id,
        order_id: json.order_id,
        user_id: json.user_id,
        customer_name: json.customer_name || "N/A",
        user: json.user || null,
        device,
        source,
        type: json.type,
        type_name: json.type_name,
        status: json.status,
        created_at: json.created_at,
        updated_at: json.updated_at,
        payload_items: payload?.items || [],
        totals: payload?.totals || {},
        raw_payload: payload,
      });
    }

    // 2. Try PickAndCollect table
    const { PickAndCollect, Product } = require("../../models");
    let pickAndCollect = await PickAndCollect.findOne({
      where: { pick_and_collect_id: orderIdValue },
      include: [
        {
          model: User,
          attributes: ["id", "fname", "lname", "email", "phone"],
          include: [
            {
              model: DeviceToken,
              attributes: ["platform"],
              required: false,
            },
          ],
        },
        {
          model: Product,
          as: "product",
          attributes: ["prod_name", "selling_price", "prod_code"],
        },
      ],
    });

    if (pickAndCollect) {
      const pc = pickAndCollect.toJSON
        ? pickAndCollect.toJSON()
        : pickAndCollect;
      let source = "Unknown";
      let device = null;

      if (
        pc.user &&
        pc.user.device_tokens &&
        pc.user.device_tokens.length > 0
      ) {
        device = Number(pc.user.device_tokens[0].platform);
        if (device === 1) source = "App";
        else if (device === 2) source = "Web";
      }

      if (pc.user) {
        pc.customer_name =
          `${pc.user.fname || ""} ${pc.user.lname || ""}`.trim();
        delete pc.user.device_tokens;
        delete pc.user.DeviceTokens;
      }

      // Reconstruct single item payload for Pick & Collect
      const productData = pc.product || {
        prod_name: "Unknown",
        selling_price: 0,
        prod_code: pc.prod_code,
      };

      const payload_items = [
        {
          product: productData,
          quantity: pc.picked_qty || 1,
        },
      ];

      return res.json({
        record_type: "pick_and_collect",
        id: pc.id,
        order_id: pc.pick_and_collect_id,
        user_id: pc.user_id,
        customer_name: pc.customer_name || "N/A",
        user: pc.user || null,
        device,
        source,
        type: pc.type,
        type_name: pc.type_name || "pick & collect",
        location: pc.location,
        location_name: pc.location_name,
        status: pc.status,
        created_at: pc.created_at,
        updated_at: pc.updated_at,
        payload_items,
        totals: {
          subTotal:
            (parseFloat(productData.selling_price) || 0) *
            (parseFloat(pc.picked_qty) || 1),
          netTotalWithOutCod:
            (parseFloat(productData.selling_price) || 0) *
            (parseFloat(pc.picked_qty) || 1),
        },
      });
    }

    return res.status(404).json({ message: "Order not found" });
  } catch (e) {
    next(e);
  }
};
