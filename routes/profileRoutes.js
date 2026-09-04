const express = require("express");

const authenticate = require(
  "../middleware/authMiddleware"
);

const {
  getMyProfile,
  changeMyPassword,
} = require(
  "../controllers/profileController"
);

const router = express.Router();

// Gets logged-in user's profile
router.get(
  "/me",
  authenticate,
  getMyProfile
);

// Changes logged-in user's password
router.patch(
  "/me/password",
  authenticate,
  changeMyPassword
);

module.exports = router;