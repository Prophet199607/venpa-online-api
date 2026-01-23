const { Wishlist, Product, ProductImage } = require("../../models");

async function getProductByCode(prodCode) {
  return Product.findOne({ where: { prod_code: prodCode } });
}

/**
 * Get user's wishlist products only
 */
exports.getWishlist = async (req, res) => {
  try {
    const userId = req.user.id;

    const wishlist = await Wishlist.findAll({
      where: { user_id: userId },
      include: [
        {
          model: Product,
          attributes: { exclude: ["id"] },
          include: [{ model: ProductImage, as: "images", attributes: { exclude: ["id", "product_id"] } }],
        },
      ],
    });

    const products = wishlist.map((item) => item.Product).filter(Boolean);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Add product to wishlist using product code
 */
exports.addToWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { prod_code } = req.body;

    if (!prod_code) {
      return res.status(400).json({ error: "Product code is required" });
    }

    const product = await getProductByCode(prod_code);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const [, created] = await Wishlist.findOrCreate({
      where: { user_id: userId, product_id: product.id },
      defaults: { user_id: userId, product_id: product.id },
    });

    res.status(created ? 201 : 200).json({
      message: created ? "Added to wishlist" : "Already in wishlist",
      item: { prod_code },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Remove product from wishlist by product code
 */
exports.removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { prod_code } = req.params;

    const product = await getProductByCode(prod_code);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const deleted = await Wishlist.destroy({
      where: { product_id: product.id, user_id: userId },
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
 * Clear all wishlist items
 */
exports.clearWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    await Wishlist.destroy({ where: { user_id: userId } });
    res.json({ message: "Wishlist cleared" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getWishlistProducts = exports.getWishlist;
