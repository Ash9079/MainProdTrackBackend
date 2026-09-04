const express = require("express");

const {
  login,
  forgotPassword,
} = require("../controllers/authController");

const authenticate = require(
  "../middleware/authMiddleware"
);

const allowRoles = require(
  "../middleware/roleMiddleware"
);

const router = express.Router();

// Login
router.post("/login", login);

// Forgot password does not require login token
router.post(
  "/forgot-password",
  forgotPassword
);

// Test: any logged-in user
router.get(
  "/profile-test",
  authenticate,
  (req, res) => {
    res.json({
      success: true,
      message:
        "Authentication successful",
      user: req.user,
    });
  }
);

// Test: Indexer only
router.get(
  "/indexer-test",
  authenticate,
  allowRoles("indexer"),
  (req, res) => {
    res.json({
      success: true,
      message:
        "Indexer access granted",
      user: req.user,
    });
  }
);

// Test: Admin only
router.get(
  "/admin-test",
  authenticate,
  allowRoles("administrator"),
  (req, res) => {
    res.json({
      success: true,
      message:
        "Administrator access granted",
      user: req.user,
    });
  }
);

module.exports = router;