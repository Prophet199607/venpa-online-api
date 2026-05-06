const express = require("express");
const router = express.Router();
const sectionsController = require("../../controllers/web/sections.controller");

router.get("/:type", sectionsController.getSection);
router.put("/:type", sectionsController.updateSection);

module.exports = router;
