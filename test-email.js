require("dotenv").config();
const {
  sendOrderConfirmationEmail,
} = require("./src/services/notifications/emailService");

// Mock user
const user = {
  fname: "Thamal",
  email: "thamalpathonimta@gmail.com",
};

// Mock checkout data
const checkoutData = {
  order_id: "TEST12345",
  type: 1, // 1 = Card, else COD
  status: "pending",
  created_at: new Date(),
  payload: {
    prod_codes: ["BOOK001", "BOOK002"],
  },
};

// Mock cart items
const cartItems = [
  {
    quantity: 2,
    product: {
      prod_name: "The Great Gatsby",
      selling_price: 1500,
    },
  },
  {
    quantity: 1,
    product: {
      prod_name: "Atomic Habits",
      selling_price: 2500,
    },
  },
];

// Run test
(async () => {
  try {
    await sendOrderConfirmationEmail(user, checkoutData, cartItems);
    console.log("✅ Test email sent successfully!");
  } catch (err) {
    console.error("❌ Error sending test email:", err);
  }
})();
