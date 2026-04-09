const router = require("express").Router();
const c = require("../../controllers/master/departments.controller");

router.get("/", c.list);
router.get("/:id", c.getById);

module.exports = router;
