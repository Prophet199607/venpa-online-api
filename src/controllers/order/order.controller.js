const { Checkout, User } = require("../../models");

exports.getAllOrders = async (req, res, next) => {
  try {
    const { status, type } = req.query;
    const where = {};

    if (status) where.status = status;
    if (type) where.type = type;

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

    const formattedOrders = orders.map((order) => {
      const json = order.toJSON ? order.toJSON() : order;
      if (json.user) {
        json.customer_name =
          `${json.user.fname || ""} ${json.user.lname || ""}`.trim();
      } else {
        json.customer_name = "N/A";
      }
      return json;
    });

    res.json(formattedOrders);
  } catch (e) {
    next(e);
  }
};
