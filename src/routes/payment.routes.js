const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");

// PayHere callback routes
router.post("/payhere/notify", paymentController.payhereNotify);
router.all("/payhere/return", paymentController.payhereReturn);
router.all("/payhere/cancel", paymentController.payhereCancel);

// Mintpay callback routes
router.all("/mintpay/success", paymentController.mintpaySuccess);
router.all("/mintpay/failed", paymentController.mintpayFailed);

module.exports = router;
