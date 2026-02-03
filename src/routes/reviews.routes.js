const router = require("express").Router();
const c = require("../controllers/reviews.controller");
const auth = require("../middleware/auth.middleware");

router.get("/product/:prod_code", c.listByProduct);
router.get("/product/:prod_code/average", c.getAverageRating);
router.post("/", auth, c.upsertReview);

module.exports = router;
