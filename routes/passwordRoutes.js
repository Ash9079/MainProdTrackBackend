const express    = require("express");
const authenticate = require("../middleware/authMiddleware");

const {
  requestPasswordReset,
  changePasswordWithToken,
  changePassword,
} = require("../controllers/passwordController");

const router = express.Router();

// Step 1 — Logged-in user requests a reset link
// Inserts a row into password_reset table
// POST /api/password/request-reset
router.post(
  "/request-reset",
  authenticate,
  requestPasswordReset
);

// Step 2 — User submits new password using token from step 1
// POST /api/password/reset-with-token
router.post(
  "/reset-with-token",
  authenticate,
  changePasswordWithToken
);

// Direct change — user knows current password
// PATCH /api/password/change-password
router.patch(
  "/change-password",
  authenticate,
  changePassword
);

module.exports = router;
