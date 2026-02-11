const router = require("express").Router();
const c = require("../controllers/appVersion.controller");
const auth = require("../middleware/auth.middleware");

router.post("/check", auth, c.checkLatestVersion);

module.exports = router;
