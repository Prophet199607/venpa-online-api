const router = require("express").Router();
const c = require("../../controllers/web/carousel.controller");

router.get("/", c.listCarousels);
router.post("/", c.createCarousel);
router.put("/:id", c.updateCarousel);
router.delete("/:id", c.deleteCarousel);

module.exports = router;
