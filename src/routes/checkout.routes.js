const router = require("express").Router();
const c = require("../controllers/checkout.controller");
const couponApply = require("../controllers/couponApply.controller");
const auth = require("../middleware/auth.middleware");

router.post("/", auth, c.createCheckout);
router.post("/payhere-hash", auth, c.createPayHereHash);
router.post("/apply-coupon", auth, couponApply.applyCouponToCart);
router.get("/:order_id/bill", auth, c.getCheckoutBill);
router.get("/", auth, c.listCheckouts);
router.put("/:order_id/status", auth, c.updateCheckoutStatus);

module.exports = router;
