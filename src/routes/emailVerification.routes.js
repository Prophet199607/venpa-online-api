const router = require("express").Router();
const c = require("../controllers/emailVerification.controller");
const auth = require("../middleware/auth.middleware");

router.post("/send", auth, c.sendCode);
router.post("/verify", auth, c.verifyCode);
router.post("/change/send", auth, c.sendEmailChangeCode);
router.post("/change/verify", auth, c.verifyEmailChange);

module.exports = router;
