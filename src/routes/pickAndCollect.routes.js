const router = require("express").Router();
const c = require("../controllers/pickAndCollect.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth, c.listMyPickAndCollects);
router.post("/payhere-hash", auth, c.createPickAndCollectPayHereHash);
router.post("/", auth, c.createPickAndCollect);

module.exports = router;
