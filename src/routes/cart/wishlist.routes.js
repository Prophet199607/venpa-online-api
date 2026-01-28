const router = require("express").Router();
const c = require("../../controllers/cart/wishlist.controller");
const auth = require("../../middleware/auth.middleware");

router.get("/", auth, c.getWishlist);
router.get("/products", auth, c.getWishlistProducts);
router.post("/", auth, c.addToWishlist);
router.post("/items", auth, c.addWishlistItems);
router.delete("/product/:prod_code", auth, c.removeFromWishlist);
router.delete("/", auth, c.clearWishlist);

module.exports = router;
