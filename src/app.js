const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./docs/openapi.json");

const departmentsRoutes = require("./routes/departments.routes");
const categoriesRoutes = require("./routes/categories.routes");
const subcategoriesRoutes = require("./routes/subcategories.routes");
const productsRoutes = require("./routes/products.routes");
const syncRoutes = require("./routes/sync.routes");

const errorMiddleware = require("./middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true, service: "venpa-online-api" }));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use("/api/v1/departments", departmentsRoutes);
app.use("/api/v1/categories", categoriesRoutes);
app.use("/api/v1/subcategories", subcategoriesRoutes);
app.use("/api/v1/products", productsRoutes);
app.use("/api/v1/sync", syncRoutes);

app.use(errorMiddleware);

module.exports = app;
