const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");

// PayHere callback routes
router.post("/payhere/notify", paymentController.payhereNotify);
router.get("/payhere/return", paymentController.payhereReturn);
router.post("/payhere/return", paymentController.payhereReturn);
router.get("/payhere/cancel", paymentController.payhereCancel);
router.post("/payhere/cancel", paymentController.payhereCancel);

// Mintpay callback routes
router.post("/mintpay/success", paymentController.mintpaySuccess);
router.post("/mintpay/failed", paymentController.mintpayFailed);

// Koko callback routes
// Frontend redirects (GET/POST from browser)
router.get("/koko/return", paymentController.kokoReturn);
router.post("/koko/return", paymentController.kokoReturn);
router.get("/koko/cancel", paymentController.kokoCancel);
router.post("/koko/cancel", paymentController.kokoCancel);

// Backend callback (server-to-server POST from Koko)
router.post("/koko/response", paymentController.kokoResponse);

module.exports = router;
