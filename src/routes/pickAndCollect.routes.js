const router = require("express").Router();
const c = require("../controllers/pickAndCollect.controller");
const couponApply = require("../controllers/couponApply.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth, c.listMyPickAndCollects);
router.post("/payhere-hash", auth, c.createPickAndCollectPayHereHash);
router.post("/", auth, c.createPickAndCollect);
router.post("/apply-coupon", auth, couponApply.applyCouponToPickAndCollect);

module.exports = router;
