const express = require("express");

const authenticate = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  getMyReportSummary,
  getMyDailyProduction,
  getEmployeeProduction,
  getProjectProduction,
  getCorrectionReport,
} = require("../controllers/reportController");

const router = express.Router();

// Gets personal report summary for Indexer or Team Lead
router.get(
  "/my-summary",
  authenticate,
  allowRoles(
  "indexer",
  "teamLead",
  "coreTeam",
  "administrator"
),
  getMyReportSummary
);

// Gets personal daily production for Indexer or Team Lead
router.get(
  "/my-daily-production",
  authenticate,
  allowRoles(
  "indexer",
  "teamLead",
  "coreTeam",
  "administrator"
),
  getMyDailyProduction
);

router.get(
  "/employee-production",
  authenticate,
  allowRoles(
  "indexer",
  "teamLead",
  "coreTeam",
  "administrator"
),
  getEmployeeProduction
);

// Gets project-wise production report
router.get(
  "/project-production",
  authenticate,
  allowRoles(
    "indexer",
    "teamLead",
    "coreTeam",
    "administrator"
  ),
  getProjectProduction
);

// Gets correction request report
router.get(
  "/correction-log",
  authenticate,
  allowRoles(
    "indexer",
    "teamLead",
    "coreTeam",
    "administrator"
  ),
  getCorrectionReport
);



module.exports = router;