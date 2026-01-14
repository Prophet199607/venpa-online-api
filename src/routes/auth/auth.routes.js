const router = require("express").Router();
const c = require("../../controllers/auth/auth.controller");

const auth = require("../../middleware/auth.middleware");

router.post("/register", c.register);
router.post("/login", c.login);
router.get("/me", auth, (req, res) => {
  const user = req.user.toJSON();
  delete user.password;
  res.json(user);
});

module.exports = router;
