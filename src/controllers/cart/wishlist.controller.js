const { Wishlist, Product, ProductImage } = require("../../models");

/**
 * Get user's wishlist with product details
 */
exports.getWishlist = async (req, res) => {
  try {
    const userId = req.user.id;

    const wishlist = await Wishlist.findAll({
      where: { user_id: userId },
      include: [
        {
          model: Product,
          include: [{ model: ProductImage, as: "images" }],
        },
      ],
    });

    res.json(wishlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Add product to wishlist
 */
exports.addToWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    const existing = await Wishlist.findOne({
      where: { user_id: userId, product_id },
    });

    if (existing) {
      return res.status(400).json({ message: "Product already in wishlist" });
    }

    const item = await Wishlist.create({
      user_id: userId,
      product_id,
    });

    res.status(201).json({ message: "Added to wishlist", item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Remove product from wishlist
 */
exports.removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const deleted = await Wishlist.destroy({
      where: { id: id, user_id: userId },
    });

    if (!deleted) {
      return res.status(404).json({ error: "Item not found in wishlist" });
    }

    res.json({ message: "Removed from wishlist" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Toggle wishlist item (Add/Remove) - Optional utility
 */
exports.toggleWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.body;

    if (!product_id)
      return res.status(400).json({ error: "Product ID required" });

    const existing = await Wishlist.findOne({
      where: { user_id: userId, product_id },
    });

    if (existing) {
      await existing.destroy();
      return res.json({ message: "Removed from wishlist", status: "removed" });
    } else {
      await Wishlist.create({ user_id: userId, product_id });
      return res
        .status(201)
        .json({ message: "Added to wishlist", status: "added" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
