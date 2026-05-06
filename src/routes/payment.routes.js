const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");

// PayHere callback routes
router.post("/payhere/notify", paymentController.payhereNotify);
router.post("/payhere/return", paymentController.payhereReturn);
router.post("/payhere/cancel", paymentController.payhereCancel);

// Mintpay callback routes
router.post("/mintpay/success", paymentController.mintpaySuccess);
router.post("/mintpay/failed", paymentController.mintpayFailed);

module.exports = router;
