const router = require("express").Router();
const c = require("../../controllers/master/products.controller");

router.get("/new/arrivals", c.newArrivals);
router.get("/best/selling", c.bestSelling);
router.get("/", c.list);
router.get("/:id", c.getById);

module.exports = router;
