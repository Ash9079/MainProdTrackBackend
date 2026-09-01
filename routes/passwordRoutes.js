const express = require("express");

const authenticate = require("../middleware/authMiddleware");


const {
  changePassword,
} = require("../controllers/passwordController");

const router = express.Router();

// Change password for logged-in user
router.patch(
  "/change-password",
  authenticate,
  changePassword
);

module.exports = router;