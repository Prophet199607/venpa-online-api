const router = require("express").Router();
const c = require("../controllers/contact.controller");

router.post("/", c.createContactMessage);

module.exports = router;
