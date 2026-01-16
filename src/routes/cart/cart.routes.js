const router = require("express").Router();
const c = require("../../controllers/cart/cart.controller");
const auth = require("../../middleware/auth.middleware");

router.get("/", auth, c.getCart);
router.post("/", auth, c.addToCart);
router.put("/:id", auth, c.updateItem);
router.delete("/:id", auth, c.removeItem);
router.delete("/", auth, c.clearCart);

module.exports = router;
