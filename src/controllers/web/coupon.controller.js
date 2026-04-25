const { Coupon } = require("../../models");

exports.listCoupons = async (req, res, next) => {
  try {
    const { code, is_active } = req.query;
    const where = {};

    if (code) {
      where.code = code;
    }
    if (is_active !== undefined) {
      where.is_active = is_active === "true" || is_active === "1";
    }

    const items = await Coupon.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    res.json(items);
  } catch (e) {
    next(e);
  }
};

exports.getCoupon = async (req, res, next) => {
  try {
    const item = await Coupon.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Coupon not found" });
    res.json(item);
  } catch (e) {
    next(e);
  }
};

exports.createCoupon = async (req, res, next) => {
  try {
    const {
      code,
      description,
      discount_type,
      discount_value,
      min_order_value,
      max_discount,
      start_date,
      end_date,
      usage_limit,
      is_active,
    } = req.body;

    if (!code) {
      return res.status(400).json({ message: "code is required" });
    }

    // Check if code already exists
    const existing = await Coupon.findOne({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    const item = await Coupon.create({
      code: code.toUpperCase(),
      description,
      discount_type: discount_type || "fixed",
      discount_value: discount_value || 0,
      min_order_value: min_order_value || 0,
      max_discount,
      start_date,
      end_date,
      usage_limit,
      is_active: is_active ?? true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
};

exports.updateCoupon = async (req, res, next) => {
  try {
    const item = await Coupon.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Coupon not found" });

    const updateData = { ...req.body };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
      // Check if new code exists for another ID
      const existing = await Coupon.findOne({
        where: {
          code: updateData.code,
          id: { [require("sequelize").Op.ne]: req.params.id },
        },
      });
      if (existing) {
        return res.status(400).json({ message: "Coupon code already exists" });
      }
    }

    await item.update({
      ...updateData,
      updated_at: new Date(),
    });

    res.json(item);
  } catch (e) {
    next(e);
  }
};

exports.toggleCoupon = async (req, res, next) => {
  try {
    const item = await Coupon.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Coupon not found" });

    await item.update({
      is_active: !item.is_active,
      updated_at: new Date(),
    });

    res.json({
      message: `Coupon ${item.is_active ? "enabled" : "disabled"}`,
      is_active: item.is_active,
    });
  } catch (e) {
    next(e);
  }
};

exports.deleteCoupon = async (req, res, next) => {
  try {
    const item = await Coupon.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Coupon not found" });

    await item.destroy();
    res.json({ message: "Coupon deleted" });
  } catch (e) {
    next(e);
  }
};
