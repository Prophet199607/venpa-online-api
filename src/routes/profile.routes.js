const router = require("express").Router();
const c = require("../controllers/profile.controller");
const authController = require("../controllers/auth/auth.controller");
const auth = require("../middleware/auth.middleware");

router.get("/summary", auth, c.getProfileSummary);
router.put("/summary", auth, c.updateProfile);
router.delete("/summary", auth, authController.deactivateAccount);
router.delete("/", auth, authController.deactivateAccount);

module.exports = router;
