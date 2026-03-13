const router = require("express").Router();
const c = require("../../controllers/master/customDisplay.controller");

router.get("/", c.list);

module.exports = router;
