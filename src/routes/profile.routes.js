const router = require("express").Router();
const c = require("../controllers/profile.controller");
const auth = require("../middleware/auth.middleware");

router.get("/summary", auth, c.getProfileSummary);
router.put("/summary", auth, c.updateProfile);

module.exports = router;
