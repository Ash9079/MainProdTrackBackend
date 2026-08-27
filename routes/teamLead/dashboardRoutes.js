// Imports Express so Team Lead dashboard routes can be created.
const express = require("express");

// Imports JWT authentication middleware to verify the logged-in user.
const authenticate = require("../../middleware/authMiddleware");

// Imports role middleware to restrict these routes to Team Leads.
const allowRoles = require("../../middleware/roleMiddleware");

// Imports all Team Lead dashboard controller functions.
const {
  getTeamLeadDashboard,
  getTeamProductivity,
  getCompletionSplit,
  getDashboardTeamMembers,
  getTeamAvailability,
  getAvailabilityProductivity,
} = require("../../controllers/teamLead/dashboardController");

// Creates an Express router for Team Lead dashboard APIs.
const router = express.Router();


// Gets the main Team Lead dashboard summary.
router.get(
  "/dashboard",
  authenticate,
  allowRoles("teamLead"),
  getTeamLeadDashboard
);


// Gets Team Lead team productivity grouped by date.
router.get(
  "/dashboard/productivity",
  authenticate,
  allowRoles("teamLead"),
  getTeamProductivity
);


// Gets completed vs pending production values.
router.get(
  "/dashboard/completion-split",
  authenticate,
  allowRoles("teamLead"),
  getCompletionSplit
);


// Gets team members displayed on the Team Lead dashboard.
router.get(
  "/dashboard/team-members",
  authenticate,
  allowRoles("teamLead"),
  getDashboardTeamMembers
);


// Gets current team availability after considering approved leave.
router.get(
  "/availability",
  authenticate,
  allowRoles("teamLead"),
  getTeamAvailability
);

// Gets today's productivity calculated against employees available for work.
router.get(
  "/dashboard/availability-productivity",
  authenticate,
  allowRoles("teamLead"),
  getAvailabilityProductivity
);

// Exports the Team Lead dashboard router for index.js.
module.exports = router;