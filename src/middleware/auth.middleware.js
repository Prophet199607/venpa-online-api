const jwt = require("jsonwebtoken");
const { User } = require("../models");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization") || req.header("authorization");
    const xAccessToken = req.header("x-access-token");

    let token = null;
    if (authHeader) {
      token = authHeader.replace(/^Bearer\s+/i, "").trim();
    } else if (xAccessToken) {
      token = String(xAccessToken).trim();
    }

    if (!token) {
      throw new Error("No authentication token provided");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ where: { id: decoded.id, status: 1 } });

    if (!user) {
      throw new Error("User not found or inactive");
    }

    req.token = token;
    req.user = user;
    next();
  } catch (error) {
    console.warn("Auth failed:", error.message);
    res.status(401).json({ error: "Please authenticate." });
  }
};

module.exports = auth;
