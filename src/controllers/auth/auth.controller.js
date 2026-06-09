const {
  User,
  PasswordReset,
  PublicEmailOtp,
  PublicPhoneOtp,
  DeviceToken,
} = require("../../models");
const { z } = require("zod");
const { Op } = require("sequelize");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const {
  generateOtpEmailHtml,
} = require("../../services/notifications/emailService");
const { sendSms } = require("../../services/notifications/smsService");

// Validation schemas
const registerSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.email || data.phone, {
    message: "Either email or phone is required",
  });

const loginSchema = registerSchema;

// ========================================
// PHONE NORMALIZATION
// ========================================

const normalizePhone = (phone) => {
  let digits = String(phone || "").replace(/\D/g, "");

  // 0717578964 -> 94717578964
  if (digits.startsWith("0") && digits.length === 10) {
    digits = "94" + digits.slice(1);
  }

  // 717578964 -> 94717578964
  else if (digits.length === 9) {
    digits = "94" + digits;
  }

  // Valid Sri Lankan mobile numbers only
  // 947XXXXXXXX
  if (!/^94(7\d{8})$/.test(digits)) {
    return null;
  }

  return digits;
};

// ========================================
// HELPERS
// ========================================

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

// Helper to update platform and device token
async function updateUserLoginInfo(userId, platform) {
  if (platform) {
    await User.update({ platform }, { where: { id: userId } });

    await DeviceToken.update({ platform }, { where: { user_id: userId } });
  }
}

// ========================================
// SEND OTP
// ========================================

exports.sendOtp = async (req, res) => {
  try {
    const { email, phone } = req.body || {};

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Email or Phone is required",
      });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // ========================================
    // EMAIL OTP
    // ========================================

    if (email) {
      const emailUser = process.env.EMAIL_USER;
      const emailPass = process.env.EMAIL_PASS;

      if (!emailUser || !emailPass) {
        return res.status(500).json({
          success: false,
          message: "Email configuration missing",
        });
      }

      const cleanEmail = String(email).trim().toLowerCase();

      // OTP cooldown check
      const existingEmailOtp = await PublicEmailOtp.findOne({
        where: {
          email: cleanEmail,
          verified_at: null,
        },
        order: [["created_at", "DESC"]],
      });

      if (
        existingEmailOtp &&
        Date.now() - new Date(existingEmailOtp.created_at).getTime() < 60 * 1000
      ) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting another OTP",
        });
      }

      await PublicEmailOtp.create({
        email: cleanEmail,
        code,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const transporter = getTransporter();
      const htmlContent = generateOtpEmailHtml(code);

      await transporter.sendMail({
        from: `Venpaa Bookshop <${emailUser}>`,
        to: cleanEmail,
        subject: "Your Venpaa Login Code",
        html: htmlContent,
      });

      return res.json({
        success: true,
        message: "OTP sent to your email",
      });
    }

    // ========================================
    // PHONE OTP
    // ========================================

    if (phone) {
      const cleanPhone = normalizePhone(phone);

      if (!cleanPhone) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number",
        });
      }

      // OTP cooldown check
      const existingPhoneOtp = await PublicPhoneOtp.findOne({
        where: {
          phone: cleanPhone,
          verified_at: null,
        },
        order: [["created_at", "DESC"]],
      });

      if (
        existingPhoneOtp &&
        Date.now() - new Date(existingPhoneOtp.created_at).getTime() < 60 * 1000
      ) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting another OTP",
        });
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
        return res.status(500).json({
          success: false,
          message: "Failed to send SMS OTP",
        });
      }

      return res.json({
        success: true,
        message: "OTP sent to your mobile number",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================================
// VERIFY OTP
// ========================================

exports.verifyOtp = async (req, res) => {
  try {
    const { email, phone, code } = req.body || {};

    if ((!email && !phone) || !code) {
      return res.status(400).json({
        success: false,
        message: "Email/Phone and code are required",
      });
    }

    const cleanCode = String(code || "").trim();

    let record = null;

    // ========================================
    // EMAIL OTP VERIFY
    // ========================================

    if (email) {
      const cleanEmail = String(email).trim().toLowerCase();

      record = await PublicEmailOtp.findOne({
        where: {
          email: cleanEmail,
          code: cleanCode,
          verified_at: null,
        },
        order: [["created_at", "DESC"]],
      });
    }

    // ========================================
    // PHONE OTP VERIFY
    // ========================================
    else if (phone) {
      const cleanPhone = normalizePhone(phone);

      if (!cleanPhone) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number",
        });
      }

      record = await PublicPhoneOtp.findOne({
        where: {
          phone: cleanPhone,
          code: cleanCode,
          verified_at: null,
        },
        order: [["created_at", "DESC"]],
      });
    }

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired code",
      });
    }

    if (record.expires_at < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Code has expired",
      });
    }

    // Mark OTP verified
    await record.update({
      verified_at: new Date(),
      updated_at: new Date(),
    });

    // ========================================
    // USER FIND / CREATE
    // ========================================

    const cleanEmail = email ? String(email).trim().toLowerCase() : null;

    const cleanPhone = phone ? normalizePhone(phone) : null;

    const userConditions = [];

    if (cleanEmail) {
      userConditions.push({ email: cleanEmail });
    }

    if (cleanPhone) {
      userConditions.push({ phone: cleanPhone });
    }

    let user = await User.findOne({
      where: {
        [Op.or]: userConditions,
      },
    });

    // ========================================
    // CREATE USER
    // ========================================

    if (!user) {
      const randomPassword = `otp_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;

      user = await User.create({
        fname: "",
        lname: "",
        email: cleanEmail,
        phone: cleanPhone,
        password: randomPassword,
        status: 1,
        auth_provider: "local",
      });
    }

    // ========================================
    // UPDATE EXISTING USER
    // ========================================
    else {
      const updateData = {};

      // Add missing email
      if (cleanEmail && !user.email) {
        const emailOwner = await User.findOne({
          where: {
            email: cleanEmail,
            id: { [Op.ne]: user.id },
          },
        });

        if (!emailOwner) {
          updateData.email = cleanEmail;
        }
      }

      // Add missing phone
      if (cleanPhone && !user.phone) {
        const phoneOwner = await User.findOne({
          where: {
            phone: cleanPhone,
            id: { [Op.ne]: user.id },
          },
        });

        if (!phoneOwner) {
          updateData.phone = cleanPhone;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await user.update(updateData);
      }
    }

    // ========================================
    // PLATFORM UPDATE
    // ========================================

    const { platform } = req.body || {};

    await updateUserLoginInfo(user.id, platform);

    const userResponse = user.toJSON();

    delete userResponse.password;

    userResponse.fname = userResponse.fname || "";
    userResponse.lname = userResponse.lname || "";
    userResponse.email = userResponse.email || "";
    userResponse.phone = userResponse.phone || "";
    userResponse.platform = platform || user.platform || "";

    return res.json({
      success: true,
      message: "Login successful",
      user: userResponse,
      token: user.generateToken(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================================
// GOOGLE LOGIN
// ========================================

exports.googleLogin = async (req, res) => {
  try {
    const { idToken, email, name } = req.body || {};

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "idToken is required",
      });
    }

    const rawIds =
      process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID;

    if (!rawIds) {
      return res.status(400).json({
        success: false,
        message: "Google client IDs not configured",
      });
    }

    const clientIds = rawIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const client = new OAuth2Client();

    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientIds,
    });

    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res.status(400).json({
        success: false,
        message: "Invalid Google token",
      });
    }

    if (email && payload.email !== email) {
      return res.status(400).json({
        success: false,
        message: "Email mismatch",
      });
    }

    const fullName = payload.name || name || payload.email;

    const parts = fullName.trim().split(/\s+/);

    const fname = parts[0] || "User";
    const lname = parts.slice(1).join(" ") || "";

    const cleanEmail = payload.email.trim().toLowerCase();

    const cleanPhone = payload.phone_number
      ? normalizePhone(payload.phone_number)
      : null;

    const userConditions = [{ email: cleanEmail }];

    if (cleanPhone) {
      userConditions.push({ phone: cleanPhone });
    }

    let user = await User.findOne({
      where: {
        [Op.or]: userConditions,
      },
    });

    // CREATE USER
    if (!user) {
      const randomPassword = `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;

      user = await User.create({
        fname,
        lname,
        email: cleanEmail,
        phone: cleanPhone,
        password: randomPassword,
        auth_provider: "google",
        status: 1,
      });
    }

    // UPDATE USER
    else {
      const updateData = {};

      if (user.auth_provider !== "google") {
        updateData.auth_provider = "google";
      }

      if (cleanPhone && !user.phone) {
        const phoneOwner = await User.findOne({
          where: {
            phone: cleanPhone,
            id: { [Op.ne]: user.id },
          },
        });

        if (!phoneOwner) {
          updateData.phone = cleanPhone;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await user.update(updateData);
      }
    }

    const { platform } = req.body || {};

    await updateUserLoginInfo(user.id, platform);

    const userResponse = user.toJSON();

    delete userResponse.password;

    userResponse.fname = userResponse.fname || "";
    userResponse.lname = userResponse.lname || "";
    userResponse.email = userResponse.email || "";
    userResponse.phone = userResponse.phone || "";
    userResponse.platform = platform || user.platform || "";

    return res.json({
      success: true,
      message: "Login successful",
      user: userResponse,
      token: user.generateToken(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
