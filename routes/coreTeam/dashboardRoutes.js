// Imports Express so Core Team dashboard routes can be created.
const express = require("express");

// Imports JWT authentication middleware to verify the logged-in user.
const authenticate = require("../../middleware/authMiddleware");

// Imports role middleware to restrict these APIs to Core Team users.
const allowRoles = require("../../middleware/roleMiddleware");

// Imports the Core Team dashboard controller function.
const {
  getCoreTeamDashboard,
  getMonthlyProductionTrend,
  getBacklogByProject,
  getPendingCorrections,
  getGuideCompliance,
  getMissingEntries,
} = require("../../controllers/coreTeam/dashboardController");

// Creates an Express router for Core Team dashboard APIs.
const router = express.Router();


// Gets the main Core Team dashboard summary.
router.get(
  "/dashboard",
  authenticate,
  allowRoles("coreTeam"),
  getCoreTeamDashboard
);

// Gets organisation-wide monthly production trend.
router.get(
  "/dashboard/monthly-trend",
  authenticate,
  allowRoles("coreTeam"),
  getMonthlyProductionTrend
);


// Gets backlog grouped by project.
router.get(
  "/dashboard/backlog-by-project",
  authenticate,
  allowRoles("coreTeam"),
  getBacklogByProject
);

// Gets the number of correction requests currently waiting for review.
router.get(
  "/dashboard/pending-corrections",
  authenticate,
  allowRoles("coreTeam"),
  getPendingCorrections
);


// Gets organisation-wide guide acknowledgement compliance.
router.get(
  "/dashboard/guide-compliance",
  authenticate,
  allowRoles("coreTeam"),
  getGuideCompliance
);


// Gets active Indexers who are missing today's daily entry.
router.get(
  "/dashboard/missing-entries",
  authenticate,
  allowRoles("coreTeam"),
  getMissingEntries
);

// Exports the router so index.js can register the Core Team APIs.
module.exports = router;