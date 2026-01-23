const { Cart, CartItem, Product, ProductImage } = require("../../models");

async function getProductByCode(prodCode) {
  return Product.findOne({ where: { prod_code: prodCode } });
}

/**
 * Get the user's active cart. If not exists, return empty or create one.
 */
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const [cart] = await Cart.findOrCreate({
      where: { user_id: userId, status: "active" },
      defaults: { user_id: userId, status: "active" },
    });

    const cartItems = await CartItem.findAll({
      where: { cart_id: cart.id },
      include: [
        {
          model: Product,
          attributes: { exclude: ["id"] },
          include: [{ model: ProductImage, as: "images", attributes: { exclude: ["id", "product_id"] } }],
        },
      ],
    });

    res.json({
      cart: { status: cart.status },
      items: cartItems.map((item) => ({
        quantity: item.quantity,
        product: item.Product || null,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Add an item to the cart using product code
 */
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { prod_code, quantity } = req.body;

    if (!prod_code || quantity === undefined) {
      return res.status(400).json({ error: "Product code and quantity are required" });
    }

    const product = await getProductByCode(prod_code);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const [cart] = await Cart.findOrCreate({
      where: { user_id: userId, status: "active" },
      defaults: { user_id: userId, status: "active" },
    });

    const existingItem = await CartItem.findOne({
      where: { cart_id: cart.id, product_id: product.id },
    });

    if (existingItem) {
      existingItem.quantity += parseInt(quantity, 10);
      await existingItem.save();
    } else {
      await CartItem.create({
        cart_id: cart.id,
        product_id: product.id,
        quantity,
      });
    }

    res.json({ message: "Item added to cart" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update item quantity by product code
 */
exports.updateItem = async (req, res) => {
  try {
    const { prod_code } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined) {
      return res.status(400).json({ error: "Quantity is required" });
    }

    const cart = await Cart.findOne({
      where: { user_id: req.user.id, status: "active" },
    });

    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const product = await getProductByCode(prod_code);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const item = await CartItem.findOne({
      where: { cart_id: cart.id, product_id: product.id },
    });

    if (!item) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    if (quantity <= 0) {
      await item.destroy();
      return res.json({ message: "Item removed from cart" });
    }

    item.quantity = quantity;
    await item.save();

    res.json({ message: "Cart item updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Replace or insert cart items in bulk using product codes
 */
exports.setCartItems = async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Items array is required" });
    }

    const [cart] = await Cart.findOrCreate({
      where: { user_id: req.user.id, status: "active" },
      defaults: { user_id: req.user.id, status: "active" },
    });

    let touched = 0;

    for (const item of items) {
      const prodCode = item?.prod_code;
      const quantity = item?.quantity;

      if (!prodCode || quantity === undefined) continue;
      const product = await getProductByCode(prodCode);
      if (!product) continue;

      const existing = await CartItem.findOne({
        where: { cart_id: cart.id, product_id: product.id },
      });

      if (quantity <= 0) {
        if (existing) {
          await existing.destroy();
        }
        continue;
      }

      if (existing) {
        existing.quantity = quantity;
        await existing.save();
      } else {
        await CartItem.create({
          cart_id: cart.id,
          product_id: product.id,
          quantity,
        });
      }
      touched++;
    }

    res.json({ message: "Cart items updated", items: touched });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update item quantity using user_id + product code
 */
exports.updateQuantity = async (req, res) => {
  try {
    const { prod_code, quantity } = req.body;

    if (!prod_code || quantity === undefined) {
      return res.status(400).json({ error: "Product code and quantity are required" });
    }

    const product = await getProductByCode(prod_code);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const [cart] = await Cart.findOrCreate({
      where: { user_id: req.user.id, status: "active" },
      defaults: { user_id: req.user.id, status: "active" },
    });

    const item = await CartItem.findOne({
      where: { cart_id: cart.id, product_id: product.id },
    });

    if (!item) {
      if (quantity <= 0) {
        return res.json({ message: "Item not in cart" });
      }
      await CartItem.create({
        cart_id: cart.id,
        product_id: product.id,
        quantity,
      });
      return res.json({ message: "Cart item created" });
    }

    if (quantity <= 0) {
      await item.destroy();
      return res.json({ message: "Item removed from cart" });
    }

    item.quantity = quantity;
    await item.save();

    res.json({ message: "Cart item updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Remove item from cart by product code
 */
exports.removeItem = async (req, res) => {
  try {
    const { prod_code } = req.params;

    const cart = await Cart.findOne({
      where: { user_id: req.user.id, status: "active" },
    });

    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const product = await getProductByCode(prod_code);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const deleted = await CartItem.destroy({
      where: { cart_id: cart.id, product_id: product.id },
    });

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
