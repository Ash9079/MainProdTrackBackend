const express = require("express");

const authenticate = require(
  "../middleware/authMiddleware"
);

const allowRoles = require(
  "../middleware/roleMiddleware"
);

const {
  getAuditLogs,
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

module.exports = router;