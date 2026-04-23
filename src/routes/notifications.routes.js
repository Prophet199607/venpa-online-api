const router = require("express").Router();
const c = require("../controllers/notifications.controller");
const auth = require("../middleware/auth.middleware");

// Device token management
router.post("/token", auth, c.registerToken);
router.delete("/token", auth, c.unregisterToken);
router.post("/test", auth, c.testNotification);

// Notification inbox
router.get("/", auth, c.getNotifications);
router.patch("/read-all", auth, c.markAllRead);
router.patch("/:id/read", auth, c.markRead);

module.exports = router;
