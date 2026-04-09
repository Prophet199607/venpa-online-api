const router = require("express").Router();
const c = require("../controllers/chathumina_web_katayam.controller");

router.get("/", c.getProducts);

module.exports = router;
