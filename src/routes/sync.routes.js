const router = require("express").Router();
const c = require("../controllers/sync.controller");

router.post("/all", c.syncAllNow);
router.post("/:entity", c.syncOne);
router.get("/status", c.getStatus);

module.exports = router;
