const express = require("express");

const authenticate = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  createLeaveRequest,
  getMyLeaveRequests,
} = require("../controllers/leaveController");

const router = express.Router();

// Creates a personal leave request
router.post(
  "/",
  authenticate,
  allowRoles("indexer", "teamLead"),
  createLeaveRequest
);

// Gets personal leave requests
router.get(
  "/my",
  authenticate,
  allowRoles("indexer", "teamLead"),
  getMyLeaveRequests
);

module.exports = router;