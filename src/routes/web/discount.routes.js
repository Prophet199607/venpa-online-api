const express = require("express");
const router = express.Router();
const discountController = require("../../controllers/web/discount.controller");

router.get("/list", discountController.list);
router.post("/save", discountController.saveDiscount);
router.delete("/delete", discountController.deleteDiscounts);

module.exports = router;
