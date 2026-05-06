const {
  WebsiteSectionProduct,
  Product,
  ProductImage,
  ProductDiscount,
  sequelize,
} = require("../../models");

exports.getSection = async (req, res, next) => {
  try {
    const { type } = req.params;

    const items = await WebsiteSectionProduct.findAll({
      where: { section_type: type },
      order: [["position", "ASC"]],
      include: [
        {
          model: Product,
          as: "product",
          include: [
            {
              model: ProductImage,
              as: "images",
            },
            {
              model: ProductDiscount,
              as: "productDiscounts",
              where: { status: 1 },
              required: false,
            },
          ],
        },
      ],
    });

    res.json({
      status: "success",
      data: items.map((item) => ({
        id: item.id,
        productId: item.product?.id,
        productCode: item.prod_code,
        position: item.position,
        product: {
          id: item.product?.id,
          prod_code: item.product?.prod_code,
          prod_name: item.product?.prod_name,
          selling_price: item.product?.selling_price,
          image_url:
            item.product?.images && item.product?.images.length > 0
              ? item.product?.images[0].image_url
              : null,
          prod_image: item.product?.prod_image,
          productDiscounts: item.product?.productDiscounts,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateSection = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { type } = req.params;
    const { items } = req.body;

    // Remove existing items for this section
    await WebsiteSectionProduct.destroy({
      where: { section_type: type },
      transaction,
    });

    // Add new items
    if (items && items.length > 0) {
      const newItems = items
        .filter((item) => item.productCode || item.prod_code)
        .map((item, index) => ({
          section_type: type,
          prod_code: item.productCode || item.prod_code,
          position: item.position || index + 1,
        }));

      if (newItems.length > 0) {
        await WebsiteSectionProduct.bulkCreate(newItems, { transaction });
      }
    }

    await transaction.commit();
    res.json({
      status: "success",
      message: "Section updated successfully",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
