const router = require("express").Router();
const c = require("../../controllers/cart/cart.controller");
const auth = require("../../middleware/auth.middleware");

router.get("/", auth, c.getCart);
router.post("/", auth, c.addToCart);
router.post("/items", auth, c.setCartItems);
router.put("/quantity", auth, c.updateQuantity);
router.put("/product/:prod_code", auth, c.updateItem);
router.delete("/product/:prod_code", auth, c.removeItem);
router.delete("/", auth, c.clearCart);

module.exports = router;
