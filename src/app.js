const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./docs/openapi.json");

const authRoutes = require("./routes/auth/auth.routes");

const departmentsRoutes = require("./routes/master/departments.routes");
const categoriesRoutes = require("./routes/master/categories.routes");
const subcategoriesRoutes = require("./routes/master/subcategories.routes");
const productsRoutes = require("./routes/master/products.routes");
const wishlistRoutes = require("./routes/cart/wishlist.routes");
const cartRoutes = require("./routes/cart/cart.routes");
const syncRoutes = require("./routes/sync.routes");
const profileRoutes = require("./routes/profile.routes");

const errorMiddleware = require("./middleware/error.middleware");

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || '*'
    : '*',
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  function normalizeBody(body) {
    if (Array.isArray(body)) {
      return body.map((item) =>
        item && typeof item.toJSON === "function" ? item.toJSON() : item
      );
    }
    if (body && typeof body.toJSON === "function") {
      return body.toJSON();
    }
    return body;
  }

  res.json = (body) => {
    const successful = res.statusCode < 400;
    const normalized = normalizeBody(body);

    if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
      if (!Object.prototype.hasOwnProperty.call(normalized, "successful")) {
        return originalJson({ ...normalized, successful });
      }
      return originalJson(normalized);
    }

    return originalJson({ successful, data: normalized });
  };

  next();
});

app.get("/", (req, res) => res.redirect("/api/docs"));

app.get("/health", (req, res) =>
  res.json({ ok: true, service: "venpa-online-api" })
);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Auth routes
app.use("/api/v1/auth", authRoutes);

// API routes
app.use("/api/v1/departments", departmentsRoutes);
app.use("/api/v1/categories", categoriesRoutes);
app.use("/api/v1/subcategories", subcategoriesRoutes);
app.use("/api/v1/products", productsRoutes);
app.use("/api/v1/sync", syncRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/profile", profileRoutes);

app.use(errorMiddleware);

module.exports = app;
