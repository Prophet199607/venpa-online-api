const express = require("express");
const router = express.Router();
const websiteDetailController = require("../../controllers/web/websiteDetail.controller");

router.get("/", websiteDetailController.getDetails);
router.put("/", websiteDetailController.updateDetails);

module.exports = router;
