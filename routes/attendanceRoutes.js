const express = require("express");

const authenticate = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  getMyAttendance,
  getAttendanceSummary,
} = require("../controllers/attendanceController");

const router = express.Router();

// Gets attendance records for the logged-in user
router.get(
  "/my",
  authenticate,
  allowRoles("indexer", "teamLead"),
  getMyAttendance
);

// Gets attendance summary for the logged-in user
router.get(
  "/summary",
  authenticate,
  allowRoles("indexer", "teamLead"),
  getAttendanceSummary
);

module.exports = router;