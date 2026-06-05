const express = require("express");
const router = express.Router();
const specificAuthorController = require("../../controllers/web/feature_author_publisher.controller");

router.get("/list", specificAuthorController.list);
router.post("/create", specificAuthorController.create);
router.put("/update/:id", specificAuthorController.update);
router.delete("/delete", specificAuthorController.delete);

module.exports = router;
