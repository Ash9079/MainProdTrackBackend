// Imports Express so we can create API routes.
const express = require("express");

// Imports JWT authentication middleware to verify the logged-in user.
const authenticate = require("../../middleware/authMiddleware");

// Imports role middleware to restrict these APIs to Team Leads.
const allowRoles = require("../../middleware/roleMiddleware");

// Imports the leave approval controller functions.
const {
  getPendingLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
} = require("../../controllers/teamLead/leaveApprovalController");

// Creates an Express router for Team Lead leave APIs.
const router = express.Router();


// Gets all pending leave requests from the Team Lead's team.
router.get(
  "/leave-requests",
  authenticate,
  allowRoles("teamLead"),
  getPendingLeaveRequests
);


// Approves a specific pending leave request.
router.patch(
  "/leave-requests/:id/approve",
  authenticate,
  allowRoles("teamLead"),
  approveLeaveRequest
);


// Rejects a specific pending leave request.
router.patch(
  "/leave-requests/:id/reject",
  authenticate,
  allowRoles("teamLead"),
  rejectLeaveRequest
);


// Exports the router so index.js can register these APIs.
module.exports = router;