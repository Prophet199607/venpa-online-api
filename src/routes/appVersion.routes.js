const router = require("express").Router();
const c = require("../controllers/appVersion.controller");

router.post("/check", c.checkLatestVersion);

module.exports = router;
