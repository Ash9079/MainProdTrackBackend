const express = require("express");

const authenticate = require("../../middleware/authMiddleware");
const allowRoles = require("../../middleware/roleMiddleware");

const {
  getPendingApprovals,
  getApprovalSummary,
  approveCorrectionRequest,
  rejectCorrectionRequest,

} = require("../../controllers/teamLead/approvalController");

const router = express.Router();

router.get(
  "/approvals",
  authenticate,
  allowRoles("teamLead"),
  getPendingApprovals
);

// Approve correction request
router.patch(
  "/approvals/:id/approve",
  authenticate,
  allowRoles("teamLead"),
  approveCorrectionRequest
);

// Reject correction request
router.patch(
  "/approvals/:id/reject",
  authenticate,
  allowRoles("teamLead"),
  rejectCorrectionRequest
);

router.get(
  "/approvals/summary",
  authenticate,
  allowRoles("teamLead"),
  getApprovalSummary
);

module.exports = router;