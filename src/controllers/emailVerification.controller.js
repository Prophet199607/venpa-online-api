const nodemailer = require("nodemailer");
const {
  EmailVerification,
  EmailChange,
  PublicEmailOtp,
  User,
} = require("../models");

function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.sendCode = async (req, res, next) => {
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass) {
      return res
        .status(400)
        .json({ message: "Email credentials not configured" });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await EmailVerification.create({
      user_id: req.user.id,
      code,
      expires_at: expiresAt,
      verified_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `Venpaa Bookshop <${emailUser}>`,
      to: req.user.email,
      subject: "Your Venpaa verification code",
      text: `Your verification code is ${code}. It expires in 5 minutes.`,
    });

    res.json({ message: "Verification code sent" });
  } catch (e) {
    next(e);
  }
};

exports.verifyCode = async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ message: "code is required" });

    const record = await EmailVerification.findOne({
      where: { user_id: req.user.id, code, verified_at: null },
      order: [["created_at", "DESC"]],
    });

    if (!record) {
      return res.status(400).json({ message: "Invalid code" });
    }
    if (record.expires_at < new Date()) {
      return res.status(400).json({ message: "Code expired" });
    }

    await record.update({ verified_at: new Date(), updated_at: new Date() });

    res.json({ message: "Email verified" });
  } catch (e) {
    next(e);
  }
};

exports.sendEmailChangeCode = async (req, res, next) => {
  try {
    const { new_email } = req.body || {};
    if (!new_email) {
      return res.status(400).json({ message: "new_email is required" });
    }

    const exists = await User.findOne({
      where: { email: new_email.trim().toLowerCase() },
    });
    if (exists) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass) {
      return res
        .status(400)
        .json({ message: "Email credentials not configured" });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await EmailChange.create({
      user_id: req.user.id,
      new_email: new_email.trim().toLowerCase(),
      code,
      expires_at: expiresAt,
      verified_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `Venpaa Bookshop <${emailUser}>`,
      to: req.user.email,
      subject: "Your Venpaa email change code",
      text: `Your email change code is ${code}. It expires in 5 minutes.`,
    });

    res.json({ message: "Email change code sent" });
  } catch (e) {
    next(e);
  }
};

exports.sendPublicOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "A valid email is required" });
    }

    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass) {
      return res
        .status(400)
        .json({ message: "Email credentials not configured" });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await PublicEmailOtp.destroy({
      where: { email, verified_at: null },
    });

    await PublicEmailOtp.create({
      email,
      code,
      expires_at: expiresAt,
      verified_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `Venpaa Bookshop <${emailUser}>`,
      to: email,
      subject: "Your Venpaa OTP",
      text: `Your OTP is ${code}. It expires in 5 minutes.`,
    });

    res.json({ message: "OTP sent" });
  } catch (e) {
    next(e);
  }
};

exports.verifyPublicOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "A valid email is required" });
    }
    if (!code) {
      return res.status(400).json({ message: "code is required" });
    }

    const record = await PublicEmailOtp.findOne({
      where: { email, code, verified_at: null },
      order: [["created_at", "DESC"]],
    });

    if (!record) {
      return res.status(400).json({ message: "Invalid code" });
    }
    if (record.expires_at < new Date()) {
      return res.status(400).json({ message: "Code expired" });
    }

    await record.update({ verified_at: new Date(), updated_at: new Date() });

    res.json({ message: "OTP verified" });
  } catch (e) {
    next(e);
  }
};

exports.verifyEmailChange = async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ message: "code is required" });

    const record = await EmailChange.findOne({
      where: { user_id: req.user.id, code, verified_at: null },
      order: [["created_at", "DESC"]],
    });

    if (!record) {
      return res.status(400).json({ message: "Invalid code" });
    }
    if (record.expires_at < new Date()) {
      return res.status(400).json({ message: "Code expired" });
    }

    await req.user.update({ email: record.new_email });
    await EmailVerification.destroy({ where: { user_id: req.user.id } });
    await record.update({ verified_at: new Date(), updated_at: new Date() });

    res.json({ message: "Email updated" });
  } catch (e) {
    next(e);
  }
};
