const router = require("express").Router();
const c = require("../../controllers/auth/auth.controller");
const profileController = require("../../controllers/profile.controller");

const auth = require("../../middleware/auth.middleware");

router.post("/register", c.sendOtp);
router.post("/login", c.login);
router.post("/verify", c.verifyOtp);
router.post("/google-login", c.googleLogin);
router.post("/apple-login", c.appleLogin);
router.get("/me", auth, (req, res) => {
  const user = req.user.toJSON();
  delete user.password;
  res.json(user);
});
router.put("/me", auth, profileController.updateProfile);
router.delete("/me", auth, c.deactivateAccount);
router.delete("/account", auth, c.deactivateAccount);
router.post("/deactivate", auth, c.deactivateAccount);

module.exports = router;
