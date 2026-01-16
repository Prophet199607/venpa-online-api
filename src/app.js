const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./docs/openapi.json");

const authRoutes = require("./routes/auth/auth.routes");

const departmentsRoutes = require("./routes/departments.routes");
const categoriesRoutes = require("./routes/categories.routes");
const subcategoriesRoutes = require("./routes/subcategories.routes");
const productsRoutes = require("./routes/products.routes");
const cartRoutes = require("./routes/cart/cart.routes");
const syncRoutes = require("./routes/sync.routes");

const errorMiddleware = require("./middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

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

app.use(errorMiddleware);

module.exports = app;
