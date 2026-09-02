const express = require("express");

const authenticate = require(
  "../middleware/authMiddleware"
);

const allowRoles = require(
  "../middleware/roleMiddleware"
);

const {
  getComplianceOverview,
    sendComplianceReminders,
} = require(
  "../controllers/complianceController"
);

const router = express.Router();

router.get(
  "/",
  authenticate,
  allowRoles(
    "coreTeam",
    "administrator"
  ),
  getComplianceOverview
);

router.post(
  "/reminders",
  authenticate,
  allowRoles(
    "coreTeam",
    "administrator"
  ),
  sendComplianceReminders
);

module.exports = router;