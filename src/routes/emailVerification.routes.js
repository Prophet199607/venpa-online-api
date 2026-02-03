const router = require("express").Router();
const c = require("../controllers/emailVerification.controller");
const auth = require("../middleware/auth.middleware");

router.post("/send", auth, c.sendCode);
router.post("/verify", auth, c.verifyCode);

module.exports = router;
