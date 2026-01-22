const { User } = require("../../models");
const { z } = require("zod");

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
    const user = await User.create(userData);

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
