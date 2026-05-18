const { Op } = require("sequelize");
const {
  Checkout,
  User,
  PickAndCollect,
  Product,
  GiftReceiverDetail,
} = require("../../models");
const {
  sendToUser,
} = require("../../services/notifications/notificationService");
const {
  NOTIFICATION_TYPES,
} = require("../../services/notifications/notificationTypes");
const { deductStock } = require("../../services/products/stockService");

exports.getAllOrders = async (req, res, next) => {
  try {
    const { status, device, order_type, start_date, end_date } = req.query;

    const userInclude = {
      model: User,
      attributes: ["id", "fname", "lname", "email", "phone", "platform"],
    };

    if (device) {
      userInclude.where = { platform: device };
      userInclude.required = true;
    }

    let checkouts = [];
    let pickAndCollects = [];

    // Common date filter
    const dateFilter = {};

    if (start_date && end_date) {
      dateFilter.created_at = {
        [Op.between]: [
          new Date(`${start_date} 00:00:00`),
          new Date(`${end_date} 23:59:59`),
        ],
      };
    } else if (start_date) {
      dateFilter.created_at = {
        [Op.gte]: new Date(`${start_date} 00:00:00`),
      };
    } else if (end_date) {
      dateFilter.created_at = {
        [Op.lte]: new Date(`${end_date} 23:59:59`),
      };
    }

    // Fetch Delivery Orders (Checkouts)
    if (!order_type || order_type === "delivery") {
      const checkoutWhere = {
        payment_status: "success",
        ...dateFilter,
      };
      if (status) checkoutWhere.status = status;

      checkouts = await Checkout.findAll({
        where: checkoutWhere,
        include: [
          userInclude,
          { model: GiftReceiverDetail, as: "giftDetails" },
        ],
        order: [["id", "DESC"]],
      });
    }

    // Fetch Pick & Collect Orders
    if (!order_type || order_type === "pick_and_collect") {
      const pcWhere = {
        payment_status: "success",
        ...dateFilter,
      };
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
        notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
        ...json,
      };

      if (json.user) {
        result.customer_name =
          `${json.user.fname || ""} ${json.user.lname || ""}`.trim();

        let platformVal = json.user.platform;
        if (device) platformVal = device;

        result.device = Number(platformVal) || null;
        if (result.device === 1) result.source = "Android";
        else if (result.device === 2) result.source = "Ios";
        else if (result.device === 3) result.source = "Web";
        else result.source = "Unknown";
      } else {
        result.customer_name = "N/A";
        result.source = "Unknown";
      }

      let payload = result.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          payload = {};
        }
      }

      const totals = payload?.totals || {};
      if (Number(result.type) === 1) {
        result.amount = totals.netTotalWithCod || totals.subTotal || 0;
      } else {
        totals.codCharge = 0;
        result.amount = totals.netTotalWithoutCod || totals.subTotal || 0;
        if (totals.netTotalWithoutCod !== undefined) {
          totals.netTotalWithCod = totals.netTotalWithoutCod;
        }
      }
      result.totals = totals;
      result.raw_payload = payload;

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
        notification_type: NOTIFICATION_TYPES.ORDER_PLACED,
        order_id: json.pick_and_collect_id,
        ...json,
      };

      if (json.user) {
        result.customer_name =
          `${json.user.fname || ""} ${json.user.lname || ""}`.trim();

        let platformVal = json.user.platform;
        if (device) platformVal = device;

        result.device = Number(platformVal) || null;
        if (result.device === 1) result.source = "Android";
        else if (result.device === 2) result.source = "Ios";
        else if (result.device === 3) result.source = "Web";
        else result.source = "Unknown";
      } else {
        result.customer_name = "N/A";
        result.source = "Unknown";
      }

      // Add complete summary for the list
      result.total_items = 1;
      const subTotal =
        (parseFloat(productData.selling_price) || 0) *
        (parseFloat(json.picked_qty) || 1);
      const discountAmount = parseFloat(json.discount_amount) || 0;
      const netTotal = subTotal - discountAmount;

      result.amount = netTotal;
      result.totals = {
        subTotal,
        discountAmount,
        netTotalWithCod: netTotal,
        netTotalWithoutCod: netTotal,
        codCharge: 0,
        courierCharge: 0,
      };

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
            "platform",
          ],
        },
        {
          model: GiftReceiverDetail,
          as: "giftDetails",
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
      if (json.user && json.user.platform) {
        device = Number(json.user.platform);
        if (device === 1) source = "Android";
        else if (device === 2) source = "Ios";
        else if (device === 3) source = "Web";
      }

      if (json.user) {
        json.customer_name =
          `${json.user.fname || ""} ${json.user.lname || ""}`.trim();
      }

      const totals = payload?.totals || {};
      const orderType = Number(json.type);

      if (orderType === 1) {
        // COD - Ensure codCharge is present (though it should be in payload already)
        // No changes needed if payload was saved correctly, but ensuring it's treated as COD
      } else {
        // Card/Mintpay (2 or 3) - Force codCharge to 0
        totals.codCharge = 0;
        // The net total should be the one without COD
        if (totals.netTotalWithoutCod !== undefined) {
          totals.netTotalWithCod = totals.netTotalWithoutCod;
        }
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
        payment_status: json.payment_status,
        created_at: json.created_at,
        updated_at: json.updated_at,
        payload_items: payload?.items || [],
        totals: totals,
        giftDetails: json.giftDetails || null,
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
          attributes: ["id", "fname", "lname", "email", "phone", "platform"],
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

      if (pc.user && pc.user.platform) {
        device = Number(pc.user.platform);
        if (device === 1) source = "Android";
        else if (device === 2) source = "Ios";
        else if (device === 3) source = "Web";
      }

      if (pc.user) {
        pc.customer_name =
          `${pc.user.fname || ""} ${pc.user.lname || ""}`.trim();
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

      const subTotal =
        (parseFloat(productData.selling_price) || 0) *
        (parseFloat(pc.picked_qty) || 1);
      const discountAmount = parseFloat(pc.discount_amount) || 0;
      const netTotal = subTotal - discountAmount;
      const orderType = Number(pc.type);

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
        payment_status: pc.payment_status,
        created_at: pc.created_at,
        updated_at: pc.updated_at,
        payload_items,
        totals: {
          subTotal: subTotal,
          discountAmount: discountAmount,
          netTotalWithCod: netTotal,
          netTotalWithoutCod: netTotal,
          codCharge: 0, // P&C usually has no COD charge, but if type=1 is COD, we keep it as 0 for now as requested
          courierCharge: 0,
        },
      });
    }

    return res.status(404).json({ message: "Order not found" });
  } catch (e) {
    next(e);
  }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { order_id: rawOrderId } = req.params;
    const { status, location: overrideLocation } = req.body || {};

    if (!status) {
      return res.status(400).json({ message: "status is required" });
    }

    const orderIdValue = isNaN(Number(rawOrderId))
      ? rawOrderId
      : Number(rawOrderId);

    // 1. Try Checkout table
    let checkout = await Checkout.findOne({
      where: { order_id: orderIdValue },
      include: [{ model: User, attributes: ["platform"] }],
    });
    if (checkout) {
      const oldStatus = checkout.status;

      // Idempotency guard: don't re-deduct stock if already confirmed
      if (
        status.toLowerCase() === "confirmed" &&
        oldStatus.toLowerCase() === "confirmed"
      ) {
        return res.status(409).json({
          message: "Order is already confirmed. Stock deduction skipped.",
        });
      }

      // Parse rowConfigs from the location field (sent as JSON string from the frontend)
      let rowConfigs = null;
      if (overrideLocation) {
        try {
          const parsed = JSON.parse(overrideLocation);
          if (Array.isArray(parsed)) rowConfigs = parsed;
        } catch (_) {
          // Not JSON – treat as a plain location string (legacy behaviour)
        }
      }

      // --- Validate rowConfigs before persisting ---
      if (status.toLowerCase() === "confirmed" && rowConfigs) {
        // Every row must have a location and a positive quantity
        const invalid = rowConfigs.filter(
          (r) => !r.location || !r.prod_code || !(r.quantity > 0),
        );
        if (invalid.length > 0) {
          return res.status(400).json({
            message:
              "All confirmation rows must have a location, product code, and positive quantity.",
            invalid_rows: invalid,
          });
        }

        // Detect duplicate (prod_code + location + price_level_id) combos
        const seen = new Set();
        for (const r of rowConfigs) {
          const key = `${r.prod_code}__${r.location}__${r.price_level_id || ""}`;
          if (seen.has(key)) {
            return res.status(400).json({
              message: `Duplicate row detected for product ${r.prod_code} at location ${r.location} with the same price level. Please merge or remove the duplicate.`,
            });
          }
          seen.add(key);
        }
      }

      // Build payload update
      let currentPayload = checkout.payload || {};
      if (typeof currentPayload === "string") {
        try {
          currentPayload = JSON.parse(currentPayload);
        } catch (_) {}
      }

      const updateData = { status, updated_at: new Date() };
      if (rowConfigs) {
        // Store confirmed rowConfigs in payload for audit trail
        updateData.payload = { ...currentPayload, confirmed_rows: rowConfigs };
      } else if (overrideLocation) {
        // Legacy single-location override
        updateData.payload = { ...currentPayload, location: overrideLocation };
      }

      await checkout.update(updateData);

      // Deduct stock only when transitioning TO confirmed
      const isBeingConfirmed =
        status.toLowerCase() === "confirmed" &&
        oldStatus.toLowerCase() !== "confirmed";

      console.log(
        `[OrderUpdate] Checkout ${orderIdValue} status: ${oldStatus} -> ${status}`,
      );

      if (isBeingConfirmed) {
        const payload = checkout.payload || {};
        let device = null;
        if (checkout.user && checkout.user.platform) {
          device = Number(checkout.user.platform);
        } else if (payload.device) {
          device = Number(payload.device);
        }
        const iid = device === 3 ? "WEB" : "APP";

        if (rowConfigs && rowConfigs.length > 0) {
          // New multi-location/price-level deduction flow
          console.log(
            `[OrderUpdate] Triggering rowConfigs stock deduction for ${rowConfigs.length} rows`,
          );
          for (const row of rowConfigs) {
            const {
              prod_code: prodCode,
              location,
              quantity,
              selling_price: rowPrice,
            } = row;
            if (!prodCode || prodCode === "N/A" || !location || !(quantity > 0))
              continue;
            console.log(
              `[OrderUpdate] Deducting ${quantity} of ${prodCode} @ ${location} (price: ${rowPrice ?? "auto"})`,
            );
            await deductStock(
              prodCode,
              location,
              quantity,
              iid,
              rowPrice ?? null,
            ).catch((err) =>
              console.error(
                `[OrderUpdate] Stock deduction failed for ${prodCode}:`,
                err,
              ),
            );
          }
        } else {
          // Legacy single-location flow
          const items = payload.items || [];
          const location = overrideLocation || payload.location || "001";
          console.log(
            `[OrderUpdate] Triggering legacy stock deduction for ${items.length} items at location ${location}`,
          );
          for (const item of items) {
            const prodCode = item.product?.prod_code || item.prod_code;
            if (prodCode && prodCode !== "N/A") {
              console.log(
                `[OrderUpdate] Deducting ${item.quantity} units of ${prodCode}`,
              );
              await deductStock(prodCode, location, item.quantity, iid).catch(
                (err) =>
                  console.error(
                    `[OrderUpdate] Stock deduction failed for ${prodCode}:`,
                    err,
                  ),
              );
            }
          }
        }
      }

      await sendToUser(checkout.user_id, {
        title: "Order status updated",
        body: `Your order ${checkout.order_id} status is now ${status}.`,
        data: {
          notification_type: NOTIFICATION_TYPES.ORDER_STATUS_UPDATE,
          order_id: String(checkout.order_id),
          status,
        },
      });
      return res.json({
        message: "Order status updated",
        order_id: checkout.order_id,
        status,
      });
    }

    // 2. Try PickAndCollect table
    let pickAndCollect = await PickAndCollect.findOne({
      where: { pick_and_collect_id: orderIdValue },
      include: [{ model: User, attributes: ["platform"] }],
    });
    if (pickAndCollect) {
      const oldStatus = pickAndCollect.status;

      // Idempotency guard: don't re-deduct stock if already confirmed
      if (
        status.toLowerCase() === "confirmed" &&
        oldStatus.toLowerCase() === "confirmed"
      ) {
        return res.status(409).json({
          message: "Order is already confirmed. Stock deduction skipped.",
        });
      }

      // Parse rowConfigs from the location field (sent as JSON string from the frontend)
      let rowConfigs = null;
      if (overrideLocation) {
        try {
          const parsed = JSON.parse(overrideLocation);
          if (Array.isArray(parsed)) rowConfigs = parsed;
        } catch (_) {
          // Not JSON
        }
      }

      // --- Validate rowConfigs before processing ---
      if (status.toLowerCase() === "confirmed" && rowConfigs) {
        // Every row must have a location and a positive quantity
        const invalid = rowConfigs.filter(
          (r) => !r.location || !r.prod_code || !(r.quantity > 0),
        );
        if (invalid.length > 0) {
          return res.status(400).json({
            message:
              "All confirmation rows must have a location, product code, and positive quantity.",
            invalid_rows: invalid,
          });
        }

        // Detect duplicate (prod_code + location + price_level_id) combos
        const seen = new Set();
        for (const r of rowConfigs) {
          const key = `${r.prod_code}__${r.location}__${r.price_level_id || ""}`;
          if (seen.has(key)) {
            return res.status(400).json({
              message: `Duplicate row detected for product ${r.prod_code} at location ${r.location}.`,
            });
          }
          seen.add(key);
        }

        // Validate total quantity against original order quantity
        const totalConfirmedQty = rowConfigs.reduce(
          (sum, r) => sum + parseFloat(r.quantity),
          0,
        );
        if (totalConfirmedQty > parseFloat(pickAndCollect.picked_qty)) {
          return res.status(400).json({
            message: `Total confirmed quantity (${totalConfirmedQty}) exceeds original order quantity (${pickAndCollect.picked_qty}).`,
          });
        }
      }

      const updateData = { status, updated_at: new Date() };

      // Note: We don't save rowConfigs to PickAndCollect table as there's no payload field
      // and location column is limited in size. We use it primarily for stock deduction.
      if (overrideLocation && !rowConfigs) {
        updateData.location = overrideLocation;
      }

      await pickAndCollect.update(updateData);

      // Deduct stock only when transitioning to confirmed
      const isBeingConfirmed =
        status.toLowerCase() === "confirmed" &&
        oldStatus.toLowerCase() !== "confirmed";

      console.log(
        `[OrderUpdate] PickAndCollect ${orderIdValue} status: ${oldStatus} -> ${status}`,
      );

      if (isBeingConfirmed) {
        let device = null;
        if (pickAndCollect.user && pickAndCollect.user.platform) {
          device = Number(pickAndCollect.user.platform);
        }
        // Fallback if no user device: assume APP if not explicitly WEB
        const iid = device === 3 ? "WEB" : "APP";

        if (rowConfigs && rowConfigs.length > 0) {
          console.log(
            `[OrderUpdate] Triggering rowConfigs stock deduction for ${rowConfigs.length} rows (PickAndCollect)`,
          );
          for (const row of rowConfigs) {
            const {
              prod_code: prodCode,
              location,
              quantity,
              selling_price: rowPrice,
            } = row;
            if (!prodCode || !location || !(quantity > 0)) continue;

            console.log(
              `[OrderUpdate] Deducting ${quantity} of ${prodCode} @ ${location} (price: ${rowPrice ?? "auto"})`,
            );
            await deductStock(
              prodCode,
              location,
              quantity,
              iid,
              rowPrice ?? null,
            ).catch((err) =>
              console.error(
                `[OrderUpdate] Stock deduction failed for ${prodCode}:`,
                err,
              ),
            );
          }
        } else {
          const location = overrideLocation || pickAndCollect.location;
          console.log(
            `[OrderUpdate] Triggering legacy stock deduction for PickAndCollect at location ${location}`,
          );
          await deductStock(
            pickAndCollect.prod_code,
            location,
            pickAndCollect.picked_qty,
            iid,
          ).catch((err) =>
            console.error(
              `[OrderUpdate] Stock deduction failed for ${pickAndCollect.prod_code}:`,
              err,
            ),
          );
        }
      }

      await sendToUser(pickAndCollect.user_id, {
        title: "Order status updated",
        body: `Your order ${pickAndCollect.pick_and_collect_id} status is now ${status}.`,
        data: {
          notification_type: NOTIFICATION_TYPES.ORDER_STATUS_UPDATE,
          order_id: String(pickAndCollect.pick_and_collect_id),
          status,
        },
      });
      return res.json({
        message: "Pick & Collect status updated",
        order_id: pickAndCollect.pick_and_collect_id,
        status,
      });
    }

    return res.status(404).json({ message: "Order not found" });
  } catch (e) {
    next(e);
  }
};
