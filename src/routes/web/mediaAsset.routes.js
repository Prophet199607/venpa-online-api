const router = require("express").Router();
const c = require("../../controllers/web/mediaAsset.controller");

router.get("/", c.listMediaAssets);
router.post("/", c.createMediaAsset);
router.put("/:id", c.updateMediaAsset);
router.delete("/:id", c.deleteMediaAsset);

module.exports = router;
