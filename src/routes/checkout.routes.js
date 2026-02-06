const router = require("express").Router();
const c = require("../controllers/checkout.controller");
const auth = require("../middleware/auth.middleware");

router.post("/", auth, c.createCheckout);
router.get("/", auth, c.listCheckouts);
router.put("/:order_id/status", auth, c.updateCheckoutStatus);

module.exports = router;
