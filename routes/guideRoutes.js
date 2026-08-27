const express = require("express");

const authenticate = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  getLatestGuide,
  acknowledgeGuide,
  getGuideHistory,
   downloadGuide,
} = require("../controllers/guideController");

const router = express.Router();

// Gets the latest active guide for Indexer or Team Lead
router.get(
  "/latest",
  authenticate,
  allowRoles("indexer", "teamLead"),
  getLatestGuide
);

// Saves guide acknowledgement for Indexer or Team Lead
router.post(
  "/:id/acknowledge",
  authenticate,
  allowRoles("indexer", "teamLead"),
  acknowledgeGuide
);

// Gets guide version history for an allowed project
router.get(
  "/:projectId/history",
  authenticate,
  allowRoles("indexer", "teamLead"),
  getGuideHistory
);
// Downloads a guide file
router.get(
  "/:id/download",
  authenticate,
  downloadGuide,
  allowRoles("indexer", "teamLead"),
  
);

module.exports = router;