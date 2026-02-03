const nodemailer = require("nodemailer");
const { EmailVerification } = require("../models");

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

exports.sendCode = async (req, res, next) => {
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass) {
      return res.status(400).json({ message: "Email credentials not configured" });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

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
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    });

    res.json({ message: "Verification code sent" });
  } catch (e) { next(e); }
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
  } catch (e) { next(e); }
};
