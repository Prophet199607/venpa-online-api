const router = require("express").Router();
const c = require("../../controllers/web/banner.controller");

router.get("/", c.listBanners);
router.post("/", c.createBanner);
router.put("/:id", c.updateBanner);
router.delete("/:id", c.deleteBanner);

module.exports = router;
