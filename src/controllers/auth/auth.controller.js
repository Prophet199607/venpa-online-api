const { User, PasswordReset } = require("../../models");
const { z } = require("zod");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");

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
    fname: z.string({ required_error: "1" }).min(1, "1"),
    lname: z.string({ required_error: "2" }).min(1, "2"),
    email: z.string({ required_error: "3" }).email("3").trim().toLowerCase(),
    phone: z.string({ required_error: "4" }).min(10, "4"),
    password: z.string({ required_error: "5" }).min(6, "5"),
    confirm_password: z.string().optional(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "6",
    path: ["confirm_password"],
  });

const loginSchema = z.object({
  email: z
    .string({ required_error: "8" })
    .min(1, "8")
    .email("3")
    .trim()
    .toLowerCase(),
  password: z.string({ required_error: "9" }).min(1, "9"),
});

exports.register = async (req, res) => {
  try {
    // Validate request body
    const validatedData = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await User.findOne({
      where: { email: validatedData.email },
    });
    if (existingUser) {
      return res.status(400).json({ success: false, error_codes: [7] });
    }

    const { confirm_password, ...userData } = validatedData;
    const user = await User.create({ ...userData, auth_provider: "local" });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: userResponse,
      token: user.generateToken(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Map Zod issues to validation error codes
      const codes = error.issues
        .map((issue) => Number(issue.message) || 0)
        .filter((c) => c !== 0);
      const uniqueCodes = [...new Set(codes)];

      return res.status(400).json({ success: false, error_codes: uniqueCodes });
    }
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ success: false, error_codes: [7] });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, error_codes: [10] });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error_codes: [10] });
    }

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json({
      success: true,
      message: "Login successful",
      user: userResponse,
      token: user.generateToken(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const codes = error.issues
        .map((issue) => Number(issue.message) || 0)
        .filter((c) => c !== 0);
      const uniqueCodes = [...new Set(codes)];
      return res.status(400).json({ success: false, error_codes: uniqueCodes });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const { idToken, email, name } = req.body || {};

    if (!idToken) {
      return res.status(400).json({ success: false, message: "idToken is required" });
    }

    const rawIds = process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID;
    if (!rawIds) {
      return res.status(400).json({ success: false, message: "Google client IDs not configured" });
    }
    const clientIds = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (!clientIds.length) {
      return res.status(400).json({ success: false, message: "Google client IDs not configured" });
    }

    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientIds,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res.status(400).json({ success: false, message: "Invalid Google token" });
    }

    if (email && payload.email !== email) {
      return res.status(400).json({ success: false, message: "Email mismatch" });
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
      return res.status(400).json({ success: false, message: "email is required" });
    }

    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass) {
      return res.status(400).json({ success: false, message: "Email credentials not configured" });
    }

    const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (user.auth_provider !== "local") {
      return res.status(400).json({ success: false, message: "Password reset not available for Google accounts" });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

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
      text: `Your password reset code is ${code}. It expires in 10 minutes.`,
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
      return res.status(400).json({ success: false, message: "email, code, new_password are required" });
    }

    const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (user.auth_provider !== "local") {
      return res.status(400).json({ success: false, message: "Password reset not available for Google accounts" });
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
