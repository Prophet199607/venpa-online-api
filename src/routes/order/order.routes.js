const router = require("express").Router();
const c = require("../../controllers/order/order.controller");

router.get("/all", c.getAllOrders);

module.exports = router;
