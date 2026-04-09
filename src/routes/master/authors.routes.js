const router = require("express").Router();
const c = require("../../controllers/master/authors.controller");

router.get("/", c.list);
router.get("/:id/books", c.getBooks);
router.get("/:id", c.getById);

module.exports = router;
