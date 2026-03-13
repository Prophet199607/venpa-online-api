const router = require("express").Router();
const c = require("../controllers/checkout.controller");
const auth = require("../middleware/auth.middleware");

router.post("/", auth, c.createCheckout);
router.get("/", auth, c.listCheckouts);
router.get("/:order_id/payhere-hash", auth, c.getPayHereHash);
router.put("/:order_id/status", auth, c.updateCheckoutStatus);

module.exports = router;
