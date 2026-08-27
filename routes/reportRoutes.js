const express = require("express");

const authenticate = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  getMyReportSummary,
  getMyDailyProduction,
} = require("../controllers/reportController");

const router = express.Router();

// Gets personal report summary for Indexer or Team Lead
router.get(
  "/my-summary",
  authenticate,
  allowRoles("indexer","teamLead"),
  getMyReportSummary
);

// Gets personal daily production for Indexer or Team Lead
router.get(
  "/my-daily-production",
  authenticate,
  allowRoles("indexer","teamLead"),
  getMyDailyProduction
);

module.exports = router;