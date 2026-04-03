const { Checkout, User } = require("../../models");

exports.getAllOrders = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = {};

    if (status) {
      where.status = status;
    }

    const orders = await Checkout.findAll({
      where,
      include: [
        {
          model: User,
          attributes: ["id", "fname", "lname", "email", "phone"],
        },
      ],
      order: [["id", "DESC"]],
    });

    res.json(orders);
  } catch (e) {
    next(e);
  }
};
