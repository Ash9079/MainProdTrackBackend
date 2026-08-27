// Imports Express so Core Team Analytics routes can be created.
const express = require("express");

// Imports JWT authentication middleware to verify the logged-in user.
const authenticate = require("../middleware/authMiddleware");

// Imports role middleware to restrict Analytics to Core Team users.
const allowRoles = require("../middleware/roleMiddleware");

// Imports all Core Team Analytics controller functions.
const {
  getAnalyticsSummary,
  getMonthlyAnalytics,
  getProjectComparison,
  getTopPerformers,
  getCompletedVsTarget,
  getStatusDistribution,
} = require("../controllers/analyticsController");

// Creates an Express router for Core Team Analytics APIs.
const router = express.Router();


// Gets the main organisation-wide Analytics KPI summary.
router.get(
  "/analytics/summary",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getAnalyticsSummary
);


// Gets organisation-wide monthly Analytics.
router.get(
  "/analytics/monthly",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getMonthlyAnalytics
);


// Gets project-wise production comparison.
router.get(
  "/analytics/projects",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getProjectComparison
);


// Gets the top-performing Indexers.
router.get(
  "/analytics/top-performers",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getTopPerformers
);

// Gets completed production compared with configured production targets.
router.get(
  "/analytics/completed-vs-target",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getCompletedVsTarget
);

// Gets completed, pending, and in-review production distribution.
router.get(
  "/analytics/status-distribution",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getStatusDistribution
);
// Exports the Analytics router so index.js can register it.
module.exports = router;