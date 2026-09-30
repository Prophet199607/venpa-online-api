const { Op } = require("sequelize");
const { StockRequest, Product } = require("../models");
const {
  sendStockRequestAlertToSales,
} = require("../services/notifications/emailService");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a stock request for an out-of-stock product.
 * Stores the request (status = 0) and emails the sales team.
 */
exports.create = async (req, res, next) => {
  try {
    const { name, email, phone_no, message, prod_code, prod_name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    if (!email || !EMAIL_REGEX.test(String(email).trim())) {
      return res.status(400).json({ message: "A valid email is required" });
    }
    if (!prod_code || !String(prod_code).trim()) {
      return res.status(400).json({ message: "prod_code is required" });
    }

    let resolvedProdName = prod_name;
    if (!resolvedProdName) {
      const product = await Product.findOne({
        where: { prod_code: String(prod_code).trim() },
        attributes: ["prod_name"],
        raw: true,
      });
      if (product) resolvedProdName = product.prod_name;
    }

    const record = await StockRequest.create({
      name: name.trim(),
      email: email.trim(),
      phone_no: phone_no ? String(phone_no).trim() : null,
      message: message ? String(message) : null,
      prod_code: String(prod_code).trim(),
      prod_name: resolvedProdName ? String(resolvedProdName) : null,
      status: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });

    try {
      await sendStockRequestAlertToSales({
        name: record.name,
        email: record.email,
        phone_no: record.phone_no,
        message: record.message,
        prod_code: record.prod_code,
        prod_name: record.prod_name,
      });
    } catch (e) {
      console.error(
        `[StockRequest] Failed to email sales alert for #${record.id}:`,
        e.message,
      );
    }

    return res.status(201).json({
      message: "Stock request recorded",
      id: record.id,
      prod_name: record.prod_name,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Lists stock requests with optional status / prod_code filters.
 */
exports.list = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      100,
    );
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.status === "0" || req.query.status === "1") {
      where.status = Number(req.query.status);
    }
    if (req.query.prod_code) {
      where.prod_code = { [Op.like]: `%${String(req.query.prod_code).trim()}%` };
    }

    const { rows, count } = await StockRequest.findAndCountAll({
      where,
      order: [["id", "DESC"]],
      limit,
      offset,
    });

    return res.json({
      data: rows,
      pagination: {
        current_page: page,
        last_page: Math.ceil(count / limit) || 0,
        total: count,
        per_page: limit,
      },
    });
  } catch (e) {
    next(e);
  }
};