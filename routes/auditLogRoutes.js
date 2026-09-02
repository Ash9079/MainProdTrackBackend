const express = require("express");

const authenticate = require(
  "../middleware/authMiddleware"
);

const allowRoles = require(
  "../middleware/roleMiddleware"
);

const {
  getAuditLogs,
  getLoginEvents,
} = require(
  "../controllers/auditLogController"
);

const router = express.Router();

router.get(
  "/",
  authenticate,
  allowRoles("administrator"),
  getAuditLogs
);

router.get(
  "/login-events",
  authenticate,
  allowRoles("administrator"),
  getLoginEvents
);

module.exports = router;