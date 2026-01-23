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

    const [item, created] = await Wishlist.findOrCreate({
      where: { user_id: userId, product_id },
      defaults: { user_id: userId, product_id },
    });

    res.status(created ? 201 : 200).json({
      message: created ? "Added to wishlist" : "Already in wishlist",
      item,
    });
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

