const express = require("express");

const authenticate = require("../../middleware/authMiddleware");
const allowRoles = require("../../middleware/roleMiddleware");

const {
  getIndexerDashboard,
} = require("../../controllers/indexer/dashboardController");

const router = express.Router();

// Gets Indexer dashboard summary
router.get(
  "/indexer",
  authenticate,
  allowRoles("indexer"),
  getIndexerDashboard
);

module.exports = router;