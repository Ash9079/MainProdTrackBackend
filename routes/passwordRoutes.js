const express = require("express");

const authenticate = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  changePassword,
} = require("../controllers/passwordController");

const router = express.Router();

// Change password for logged-in user
router.patch(
  "/change-password",
  authenticate,
  allowRoles("indexer", "teamLead"),
  changePassword
);

module.exports = router;