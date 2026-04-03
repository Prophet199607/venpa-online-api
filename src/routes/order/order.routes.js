const router = require("express").Router();
const c = require("../../controllers/order/order.controller");

router.get("/all", c.getAllOrders);
router.get("/:order_id", c.getOrderById);

module.exports = router;
