const express = require("express");
const router = express.Router();
const specificAuthorController = require("../../controllers/web/feature_author_publisher.controller");

// GET  /specific-authors/list              — list all (filter by ?author_id=)
router.get("/list", specificAuthorController.list);

// POST /specific-authors/create            — create new record
router.post("/create", specificAuthorController.create);


// PATCH /specific-authors/position/:id    — update position only
router.patch("/position/:id", specificAuthorController.updatePosition);

// DELETE /specific-authors/delete         — delete by ids array
router.delete("/delete", specificAuthorController.delete);

module.exports = router;