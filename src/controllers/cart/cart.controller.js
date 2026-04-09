const {
  Cart,
  CartItem,
  Product,
  ProductImage,
  CodValueCharge,
  CourierWeightCharge,
} = require("../../models");
const { Op } = require("sequelize");

async function getProductByCode(prodCode) {
  return Product.findOne({ where: { prod_code: prodCode } });
}

async function getOrCreateActiveCart(userId) {
  const [cart] = await Cart.findOrCreate({
    where: { user_id: userId, status: "active" },
    defaults: { user_id: userId, status: "active" },
  });

  return cart;
}

/**
 * Get the user's active cart. If not exists, return empty or create one.
 */
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await getOrCreateActiveCart(userId);

    const cartItems = await CartItem.findAll({
      where: { cart_id: cart.id },
      include: [
        {
          model: Product,
          attributes: { exclude: ["id"] },
          include: [
            {
              model: ProductImage,
              as: "images",
              attributes: { exclude: ["id", "product_id"] },
            },
          ],
        },
      ],
    });

    let subTotal = 0;
    let totalWeight = 0;

    const formattedItems = cartItems.map((item) => {
      const product = item.product
        ? item.product.toJSON
          ? item.product.toJSON()
          : item.product
        : null;
      const quantity = parseInt(item.quantity || 0, 10);
      const price = parseFloat(product?.selling_price || 0);
      const weight = parseFloat(product?.weight || 0);

      subTotal += price * quantity;
      totalWeight += weight * quantity;

      return {
        quantity: item.quantity,
        product: product,
      };
    });

    // Calculate COD Charge
    const codChargeEntry = await CodValueCharge.findOne({
      where: {
        value_from: { [Op.lte]: subTotal },
        value_to: { [Op.gte]: subTotal },
      },
    });
    const codCharge = parseFloat(codChargeEntry?.charge || 0);

    // Calculate Courier Charge
    const courierChargeEntry = await CourierWeightCharge.findOne({
      where: {
        weight_from: { [Op.lte]: totalWeight },
        weight_to: { [Op.gte]: totalWeight },
      },
    });
    const courierCharge = parseFloat(courierChargeEntry?.charge || 0);

    const netTotalWithCod = subTotal + codCharge + courierCharge;
    const netTotalWithOutCod = subTotal + courierCharge;

    res.json({
      cart: {
        status: cart.status,
        subTotal,
        totalWeight,
        codCharge,
        courierCharge,
        netTotalWithCod,
        netTotalWithOutCod,
      },
      items: formattedItems,
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
      return res
        .status(400)
        .json({ error: "Product code and quantity are required" });
    }

    const product = await getProductByCode(prod_code);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const cart = await getOrCreateActiveCart(userId);

    const existingItem = await CartItem.findOne({
      where: { cart_id: cart.id, product_id: product.id },
    });

    if (existingItem) {
      existingItem.quantity += parseInt(quantity, 10);
      existingItem.updated_at = new Date();
      await existingItem.save();
    } else {
      const now = new Date();
      await CartItem.create({
        cart_id: cart.id,
        product_id: product.id,
        quantity,
        created_at: now,
        updated_at: now,
        expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
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
    item.updated_at = new Date();
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

    const cart = await getOrCreateActiveCart(req.user.id);

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
        existing.updated_at = new Date();
        await existing.save();
      } else {
        const now = new Date();
        await CartItem.create({
          cart_id: cart.id,
          product_id: product.id,
          quantity,
          created_at: now,
          updated_at: now,
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
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
      return res
        .status(400)
        .json({ error: "Product code and quantity are required" });
    }

    const product = await getProductByCode(prod_code);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const cart = await getOrCreateActiveCart(req.user.id);

    const item = await CartItem.findOne({
      where: { cart_id: cart.id, product_id: product.id },
    });

    if (!item) {
      if (quantity <= 0) {
        return res.json({ message: "Item not in cart" });
      }
      const now = new Date();
      await CartItem.create({
        cart_id: cart.id,
        product_id: product.id,
        quantity,
        created_at: now,
        updated_at: now,
        expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      });
      return res.json({ message: "Cart item created" });
    }

    if (quantity <= 0) {
      await item.destroy();
      return res.json({ message: "Item removed from cart" });
    }

    item.quantity = quantity;
    item.updated_at = new Date();
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
