const {
  User,
  PasswordReset,
  PublicEmailOtp,
  PublicPhoneOtp,
  DeviceToken,
} = require("../../models");
const { z } = require("zod");
const { Op } = require("sequelize");
const { OAuth2Client } = require("google-auth-library");
const {
  generateOtpEmailHtml,
  getTransporter,
} = require("../../services/notifications/emailService");
const { sendSms } = require("../../services/notifications/smsService");
const {
  isMobileBypassLogin,
  REVIEW_KEY_HEADER,
} = require("../../services/auth/mobileAuth");
const { normalizePhone } = require("../../utils/phone");
const {
  verifyAppleToken,
  parseFullName,
} = require("../../services/auth/appleAuth");

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
// HELPERS
// ========================================

function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper to update platform and device token
async function updateUserLoginInfo(userId, platform) {
  if (platform) {
    await User.update({ platform }, { where: { id: userId } });

    // Only update platform for existing tokens, don't create new ones
    await DeviceToken.update(
      { platform, updated_at: new Date() },
      { where: { user_id: userId } },
    );
  }
}

// Find an existing user by email/phone or create a new local user.
async function findOrCreateUser({ cleanEmail = null, cleanPhone = null }) {
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

  if (user && Number(user.status) === 0) {
    const error = new Error("Account not found");
    error.status = 404;
    throw error;
  }

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

    return user;
  }

  // ========================================
  // UPDATE EXISTING USER
  // ========================================

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

  return user;
}

async function buildLoginResponse(user, platform) {
  await updateUserLoginInfo(user.id, platform);

  const userResponse = user.toJSON();

  delete userResponse.password;

  userResponse.fname = userResponse.fname || "";
  userResponse.lname = userResponse.lname || "";
  userResponse.email = userResponse.email || "";
  userResponse.phone = userResponse.phone || "";
  userResponse.platform = platform || user.platform || "";

  return {
    success: true,
    message: "Login successful",
    user: userResponse,
    token: user.generateToken(),
  };
}

// ========================================
// SEND OTP
// ========================================

const sendOtpHandler = async (req, res, { allowMobileBypass = false } = {}) => {
  try {
    const { email, phone, platform } = req.body || {};

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Email or Phone is required",
      });
    }

    // Check if account exists but is deactivated (status = 0)
    const deactivatedCheckConditions = [];
    if (email) {
      deactivatedCheckConditions.push({
        email: String(email).trim().toLowerCase(),
      });
    }
    if (phone) {
      const cleanPhone = normalizePhone(phone);
      if (cleanPhone) {
        deactivatedCheckConditions.push({ phone: cleanPhone });
      }
    }

    if (deactivatedCheckConditions.length > 0) {
      const existingUser = await User.findOne({
        where: { [Op.or]: deactivatedCheckConditions },
      });

      if (existingUser && Number(existingUser.status) === 0) {
        return res.status(404).json({
          success: false,
          message: "Account not found",
        });
      }
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

      // ========================================
      // PASSWORDLESS MOBILE LOGIN (NO OTP)
      // ========================================
      //
      // Only evaluated on the login endpoint. Every control must pass:
      // allowlisted number + native platform + kill switch + optional review
      // key (+ expiry). Anything else falls through to the normal OTP flow.

      const mobileBypassAllowed =
        allowMobileBypass &&
        isMobileBypassLogin(
          cleanPhone,
          platform,
          req.header(REVIEW_KEY_HEADER),
        );

      if (mobileBypassAllowed) {
        console.warn(
          `[auth] Passwordless mobile login used | phone=${cleanPhone} platform=${platform} ip=${req.ip} ua="${req.get("user-agent") || ""}"`,
        );

        const user = await findOrCreateUser({ cleanPhone });

        return res.json(await buildLoginResponse(user, platform));
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

// Register keeps the original OTP-only behaviour.
exports.sendOtp = (req, res) => sendOtpHandler(req, res);

// Login is the only endpoint allowed to use the OTP-less mobile bypass.
exports.login = (req, res) =>
  sendOtpHandler(req, res, { allowMobileBypass: true });

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

    // Check if account is deactivated (status = 0)
    const deactivatedVerifyConditions = [];
    if (email) {
      deactivatedVerifyConditions.push({
        email: String(email).trim().toLowerCase(),
      });
    }
    if (phone) {
      const cleanPhone = normalizePhone(phone);
      if (cleanPhone) {
        deactivatedVerifyConditions.push({ phone: cleanPhone });
      }
    }

    if (deactivatedVerifyConditions.length > 0) {
      const existingUser = await User.findOne({
        where: { [Op.or]: deactivatedVerifyConditions },
      });

      if (existingUser && Number(existingUser.status) === 0) {
        return res.status(404).json({
          success: false,
          message: "Account not found",
        });
      }
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

    const user = await findOrCreateUser({ cleanEmail, cleanPhone });

    // ========================================
    // PLATFORM UPDATE + RESPONSE
    // ========================================

    const { platform } = req.body || {};

    return res.json(await buildLoginResponse(user, platform));
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

    const rawId = process.env.GOOGLE_CLIENT_ID;

    if (!rawId) {
      return res.status(400).json({
        success: false,
        message: "Google client IDs not configured",
      });
    }

    const clientIds = rawId
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

    if (user && Number(user.status) === 0) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

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

    return res.json(await buildLoginResponse(user, platform));
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================================
// APPLE LOGIN
// ========================================

exports.appleLogin = async (req, res) => {
  try {
    const { identityToken, email, name, platform } = req.body || {};

    if (!identityToken) {
      return res.status(400).json({
        success: false,
        message: "identityToken is required",
      });
    }

    const rawId = process.env.APPLE_CLIENT_ID;

    if (!rawId) {
      return res.status(500).json({
        success: false,
        message: "Apple client ID not configured",
      });
    }

    // 1. Verify token really came from Apple
    let payload;
    try {
      payload = await verifyAppleToken(identityToken);
    } catch (verifyErr) {
      return res.status(401).json({
        success: false,
        message: "Invalid Apple token",
      });
    }

    const appleId = payload && payload.sub;
    if (!appleId) {
      return res.status(401).json({
        success: false,
        message: "Invalid Apple token payload: missing sub",
      });
    }

    // Determine email (token payload first, fallback to body on first sign-in)
    const rawEmail = payload.email || email;
    const cleanEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : null;

    // 2. Primary lookup: Always find existing user by apple_id (sub)
    let user = await User.findOne({
      where: { apple_id: appleId },
    });

    if (user && Number(user.status) === 0) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    // 3. First time / Link account: check if user already exists by verified email
    if (!user && cleanEmail) {
      user = await User.findOne({
        where: { email: cleanEmail },
      });

      if (user && Number(user.status) === 0) {
        return res.status(404).json({
          success: false,
          message: "Account not found",
        });
      }

      if (user) {
        // Link Apple ID to the existing account
        const updateData = { apple_id: appleId };
        if (user.auth_provider === "local") {
          updateData.auth_provider = "apple";
        }
        await user.update(updateData);
      }
    }

    // 4. Create new user if no match found
    if (!user) {
      const { fname, lname } = parseFullName(name, cleanEmail);
      const randomPassword = `apple_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;

      user = await User.create({
        fname,
        lname,
        email: cleanEmail,
        phone: null,
        password: randomPassword,
        apple_id: appleId,
        auth_provider: "apple",
        platform: platform || "2",
        status: 1,
      });
    } else {
      // Existing user: backfill email or name if missing
      const updateData = {};

      if (!user.email && cleanEmail) {
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

      if ((!user.fname || user.fname === "Apple User") && name) {
        const { fname, lname } = parseFullName(name, cleanEmail);
        if (fname) updateData.fname = fname;
        if (lname) updateData.lname = lname;
      }

      if (Object.keys(updateData).length > 0) {
        await user.update(updateData);
      }
    }

    // 5. Standardized login response
    return res.json(await buildLoginResponse(user, platform || "2"));
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========================================
// DEACTIVATE / DELETE ACCOUNT
// ========================================

exports.deactivateAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 1. Mark user status as 0 (deactivated/deleted)
    await User.update(
      { status: 0, updated_at: new Date() },
      { where: { id: userId } },
    );

    // 2. Remove active push notification device tokens
    await DeviceToken.destroy({
      where: { user_id: userId },
    });

    return res.json({
      success: true,
      message: "Account deactivated successfully",
    });
  } catch (error) {
    next(error);
  }
};

