const router = require("express").Router();
const c = require("../../controllers/cart/wishlist.controller");
const auth = require("../../middleware/auth.middleware");

router.get("/", auth, c.getWishlist);
router.get("/products", auth, c.getWishlistProducts);
router.post("/", auth, c.addToWishlist);
router.delete("/:id", auth, c.removeFromWishlist);
router.delete("/", auth, c.clearWishlist);

module.exports = router;
