const express = require("express");

const authenticate = require(
  "../middleware/authMiddleware"
);

const allowRoles = require(
  "../middleware/roleMiddleware"
);

const {
  getSettings,
  updateSettings,
} = require(
  "../controllers/settingsController"
);

const router = express.Router();

router.get(
  "/",
  authenticate,
  allowRoles("administrator"),
  getSettings
);

router.patch(
  "/",
  authenticate,
  allowRoles("administrator"),
  updateSettings
);

module.exports = router;