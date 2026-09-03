const express = require("express");

const authenticate = require("../../middleware/authMiddleware");
const allowRoles = require("../../middleware/roleMiddleware");

const {
  createCorrectionRequest,
  getMyCorrectionRequests,
  getLockedEntries,
} = require("../../controllers/indexer/correctionController");

const router = express.Router();

// Gets the logged-in Indexer's locked entries for the correction form
router.get(
  "/locked-entries",
  authenticate,
  allowRoles("indexer"),
  getLockedEntries
);

// Gets correction requests created by the logged-in Indexer
router.get(
  "/my",
  authenticate,
  allowRoles("indexer"),
  getMyCorrectionRequests
);

// Allows an Indexer to submit a correction request
router.post(
  "/",
  authenticate,
  allowRoles("indexer"),
  createCorrectionRequest
);

module.exports = router;