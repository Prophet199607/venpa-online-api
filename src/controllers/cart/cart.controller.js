const { Cart, CartItem, Product, ProductImage } = require("../../models");

/**
 * Get the user's active cart. If not exists, return empty or create one.
 */
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find or create active cart for user
    let [cart] = await Cart.findOrCreate({
      where: { user_id: userId, status: "active" },
      defaults: { user_id: userId, status: "active" },
    });

    // Fetch items with product details
    const cartItems = await CartItem.findAll({
      where: { cart_id: cart.id },
      include: [
        {
          model: Product,
          include: [{ model: ProductImage, as: "images" }],
        },
      ],
    });

    res.json({ cart, items: cartItems });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Add an item to the cart
 */
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, quantity } = req.body;

    if (!product_id || !quantity) {
      return res
        .status(400)
        .json({ error: "Product ID and quantity are required" });
    }

    // Ensure active cart exists
    let [cart] = await Cart.findOrCreate({
      where: { user_id: userId, status: "active" },
      defaults: { user_id: userId, status: "active" },
    });

    // Check if item already in cart
    const existingItem = await CartItem.findOne({
      where: { cart_id: cart.id, product_id },
    });

    if (existingItem) {
      existingItem.quantity += parseInt(quantity);
      await existingItem.save();
    } else {
      await CartItem.create({
        cart_id: cart.id,
        product_id,
        quantity,
      });
    }

    res.json({ message: "Item added to cart", cartId: cart.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update item quantity
 */
exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params; // Cart Item ID
    const { quantity } = req.body;

    if (quantity === undefined) {
      return res.status(400).json({ error: "Quantity is required" });
    }

    const item = await CartItem.findByPk(id);

    if (!item) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    if (quantity <= 0) {
      await item.destroy();
      return res.json({ message: "Item removed from cart" });
    }

    item.quantity = quantity;
    await item.save();

    res.json({ message: "Cart item updated", item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Remove item from cart
 */
exports.removeItem = async (req, res) => {
  try {
    const { id } = req.params; // Cart Item ID

    const deleted = await CartItem.destroy({ where: { id } });

    if (!deleted) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    res.json({ message: "Item removed from cart" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Clear all items in the cart
 */
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({
      where: { user_id: userId, status: "active" },
    });

    if (cart) {
      await CartItem.destroy({ where: { cart_id: cart.id } });
    }

    res.json({ message: "Cart cleared" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
