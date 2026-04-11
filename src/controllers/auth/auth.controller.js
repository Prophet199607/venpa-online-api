const {
  User,
  PasswordReset,
  PublicEmailOtp,
  PublicPhoneOtp,
} = require("../../models");
const { z } = require("zod");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");
const {
  generateOtpEmailHtml,
} = require("../../services/notifications/emailService");
const { sendSms } = require("../../services/notifications/smsService");

// Validation schemas
// 1: First name is required
// 2: Last name is required
// 3: Invalid email address
// 4: Invalid phone number
// 5: Password must be at least 6 characters
// 6: Passwords don't match
// 7: Email already in use
// 8: Email is required (Login)
// 9: Password is required (Login)
// 10: Invalid credentials (Login)
const registerSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.email || data.phone, {
    message: "Either email or phone is required",
  });

const loginSchema = registerSchema;

// 1. Send OTP for Login / Registration
exports.sendOtp = async (req, res) => {
  try {
    const { email, phone } = req.body || {};

    if (!email && !phone) {
      return res
        .status(400)
        .json({ success: false, message: "Email or Phone is required" });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (email) {
      const emailUser = process.env.EMAIL_USER;
      const emailPass = process.env.EMAIL_PASS;
      if (!emailUser || !emailPass) {
        return res
          .status(500)
          .json({ success: false, message: "Email configuration missing" });
      }

      await PublicEmailOtp.create({
        email: email.trim().toLowerCase(),
        code,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const transporter = getTransporter();
      const htmlContent = generateOtpEmailHtml(code);

      await transporter.sendMail({
        from: `Venpaa Bookshop <${emailUser}>`,
        to: email,
        subject: "Your Venpaa Login Code",
        html: htmlContent,
      });

      return res.json({ success: true, message: "OTP sent to your email" });
    }

    if (phone) {
      // Validate phone (basic check)
      const cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length < 9) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid phone number" });
      }

      await PublicPhoneOtp.create({
        phone: cleanPhone,
        code,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const smsMessage = `Your OTP for login is: ${code}. It is valid for 5 minutes. Do not share this code with anyone.`;
      const smsResult = await sendSms(cleanPhone, smsMessage);

      if (!smsResult.success) {
        return res
          .status(500)
          .json({ success: false, message: "Failed to send SMS OTP" });
      }

      return res.json({
        success: true,
        message: "OTP sent to your mobile number",
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Verify OTP and handle Login/Registration
exports.verifyOtp = async (req, res) => {
  try {
    const { email, phone, code } = req.body || {};
    if ((!email && !phone) || !code) {
      return res
        .status(400)
        .json({ success: false, message: "Email/Phone and code are required" });
    }

    const cleanCode = String(code || "").trim();
    let record = null;
    let queryField = {};

    if (email) {
      const cleanEmail = String(email || "")
        .trim()
        .toLowerCase();
      record = await PublicEmailOtp.findOne({
        where: { email: cleanEmail, code: cleanCode, verified_at: null },
        order: [["created_at", "DESC"]],
      });
      queryField = { email: cleanEmail };
    } else if (phone) {
      const cleanPhone = phone.replace(/\D/g, "");
      record = await PublicPhoneOtp.findOne({
        where: { phone: cleanPhone, code: cleanCode, verified_at: null },
        order: [["created_at", "DESC"]],
      });
      queryField = { phone: cleanPhone };
    }

    if (!record) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired code" });
    }

    if (record.expires_at < new Date()) {
      return res
        .status(400)
        .json({ success: false, message: "Code has expired" });
    }

    // Mark as verified
    await record.update({ verified_at: new Date(), updated_at: new Date() });

    // Handle User creation or fetch
    let user = await User.findOne({ where: queryField });
    if (!user) {
      // Create new user automatically during first login/registration
      const randomPassword = `otp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      user = await User.create({
        ...queryField,
        fname: "",
        lname: "",
        email: email ? email.trim().toLowerCase() : `${phone}@venpaa.com`, // Placeholder email if phone login
        phone: phone ? phone.replace(/\D/g, "") : "0000000000",
        password: randomPassword,
        status: 1,
        auth_provider: "local",
      });
    }

    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json({
      success: true,
      message: "Login successful",
      user: userResponse,
      token: user.generateToken(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const { idToken, email, name } = req.body || {};

    if (!idToken) {
      return res
        .status(400)
        .json({ success: false, message: "idToken is required" });
    }

    const rawIds =
      process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID;
    if (!rawIds) {
      return res
        .status(400)
        .json({ success: false, message: "Google client IDs not configured" });
    }
    const clientIds = rawIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!clientIds.length) {
      return res
        .status(400)
        .json({ success: false, message: "Google client IDs not configured" });
    }

    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientIds,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Google token" });
    }

    if (email && payload.email !== email) {
      return res
        .status(400)
        .json({ success: false, message: "Email mismatch" });
    }

    const fullName = payload.name || name || payload.email;
    const parts = fullName.trim().split(/\s+/);
    const fname = parts[0] || "User";
    const lname = parts.slice(1).join(" ") || " ";

    let user = await User.findOne({ where: { email: payload.email } });
    if (!user) {
      const randomPassword = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      user = await User.create({
        fname,
        lname,
        email: payload.email,
        phone: payload.phone_number || "0000000000",
        password: randomPassword,
        auth_provider: "google",
        status: 1,
      });
    } else if (user.auth_provider !== "google") {
      await user.update({ auth_provider: "google" });
    }

    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json({
      success: true,
      message: "Login successful",
      user: userResponse,
      token: user.generateToken(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

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

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "email is required" });
    }

    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass) {
      return res
        .status(400)
        .json({ success: false, message: "Email credentials not configured" });
    }

    const user = await User.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (user.auth_provider !== "local") {
      return res.status(400).json({
        success: false,
        message: "Password reset not available for Google accounts",
      });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await PasswordReset.create({
      user_id: user.id,
      code,
      expires_at: expiresAt,
      used_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `Venpaa Bookshop <${emailUser}>`,
      to: user.email,
      subject: "Your Venpaa password reset code",
      text: `Your password reset code is ${code}. It expires in 5 minutes.`,
    });

    res.json({ success: true, message: "Password reset code sent" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, code, new_password } = req.body || {};

    if (!email || !code || !new_password) {
      return res.status(400).json({
        success: false,
        message: "email, code, new_password are required",
      });
    }

    const user = await User.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (user.auth_provider !== "local") {
      return res.status(400).json({
        success: false,
        message: "Password reset not available for Google accounts",
      });
    }

    const record = await PasswordReset.findOne({
      where: { user_id: user.id, code, used_at: null },
      order: [["created_at", "DESC"]],
    });

    if (!record) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }
    if (record.expires_at < new Date()) {
      return res.status(400).json({ success: false, message: "Code expired" });
    }

    await user.update({ password: new_password });
    await record.update({ used_at: new Date(), updated_at: new Date() });

    res.json({ success: true, message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
