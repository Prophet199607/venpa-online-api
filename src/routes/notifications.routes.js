const router = require("express").Router();
const c = require("../controllers/notifications.controller");
const auth = require("../middleware/auth.middleware");

router.post("/token", auth, c.registerToken);
router.delete("/token", auth, c.unregisterToken);
router.post("/test", auth, c.testNotification);

module.exports = router;
