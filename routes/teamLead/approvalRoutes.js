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

const approveCorrection = [
  authenticate,
  allowRoles("teamLead", "coreTeam", "administrator"),
  approveCorrectionRequest,
];

const rejectCorrection = [
  authenticate,
  allowRoles("teamLead", "coreTeam", "administrator"),
  rejectCorrectionRequest,
];

router.post("/approvals/:id/approve", ...approveCorrection);
router.patch("/approvals/:id/approve", ...approveCorrection);

router.post("/approvals/:id/reject", ...rejectCorrection);
router.patch("/approvals/:id/reject", ...rejectCorrection);

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

