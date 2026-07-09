const router = require("express").Router();
const c = require("../../controllers/web/customer.controller");

router.get("/", c.listUsers);
router.get("/by-date", c.getUsersByDate);
router.patch("/:id/payment-summaries/acc-code", c.updateAccCode);
router.get("/:id/order-products", c.getUserOrderProducts);
module.exports = router;