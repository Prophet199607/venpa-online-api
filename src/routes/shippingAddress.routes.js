const router = require("express").Router();
const c = require("../controllers/shippingAddress.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth, c.getMyShippingAddress);
router.put("/", auth, c.upsertMyShippingAddress);

module.exports = router;
