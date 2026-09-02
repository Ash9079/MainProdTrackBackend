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
  allowRoles(
      "teamLead",
      "coreTeam",
      "administrator"
    ),
  getPendingApprovals
);

// Approve correction request
router.patch(
  "/approvals/:id/approve",
  authenticate,
  allowRoles(
    "teamLead",
    "coreTeam",
    "administrator"
  ),
  approveCorrectionRequest
);

// Reject correction request
router.patch(
  "/approvals/:id/reject",
  authenticate,
  allowRoles(
    "teamLead",
    "coreTeam",
    "administrator"
  ),
  rejectCorrectionRequest
);

router.get(
  "/approvals/summary",
  authenticate,
    allowRoles(
    "teamLead",
    "coreTeam",
    "administrator"
  ),
  getApprovalSummary
);

module.exports = router;