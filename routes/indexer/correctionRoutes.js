const express = require("express");

const authenticate = require("../../middleware/authMiddleware");
const allowRoles = require("../../middleware/roleMiddleware");

const {
  createCorrectionRequest,
  getMyCorrectionRequests,
} = require("../../controllers/indexer/correctionController");

const router = express.Router();

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