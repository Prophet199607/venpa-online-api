const router = require("express").Router();
const c = require("../../controllers/web/coupon.controller");

router.get("/", c.listCoupons);
router.post("/", c.createCoupon);
router.get("/:id", c.getCoupon);
router.put("/:id", c.updateCoupon);
router.patch("/:id/toggle", c.toggleCoupon);
router.delete("/:id", c.deleteCoupon);

module.exports = router;
