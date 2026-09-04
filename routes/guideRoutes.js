// Imports Express to create the Guide API router.
const express = require("express");

// Imports authentication middleware to validate the logged-in user.
const authenticate = require("../middleware/authMiddleware");

// Imports role middleware to restrict Guide APIs by application role.
const allowRoles = require("../middleware/roleMiddleware");

// Imports Multer middleware used for PDF guide uploads.
const guideUpload = require(
  "../middleware/guideUploadMiddleware"
);

// Imports all shared Guide controller functions.
const {
  getLatestGuide,
  acknowledgeGuide,
  getGuideHistory,
  downloadGuide,
  getGuideManagerList,
  getGuideCompliance,
  uploadGuideVersion,
  getPendingAckGuide,
  getGuideSections,
  updateGuideSection,
} = require("../controllers/guideController");

// Creates the shared Guide router.
const router = express.Router();

// ======================================================
// CORE TEAM / ADMINISTRATOR GUIDE MANAGER
// ======================================================

// Gets all latest guides with acknowledgement percentages.
router.get(
  "/manage",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getGuideManagerList
);

// Uploads a new PDF version of an existing guide.
router.post(
  "/manage/upload",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  guideUpload.single("file"),
  uploadGuideVersion
);

// Gets acknowledgement compliance for one guide version.
router.get(
  "/manage/:id/compliance",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getGuideCompliance
);

// ======================================================
// INDEXER / TEAM LEAD GUIDE APIs
// ======================================================

// Gets the latest unacknowledged guide for the login popup modal.
router.get(
  "/pending-ack",
  authenticate,
  allowRoles("indexer"),
  getPendingAckGuide
);

// Gets the latest active guides assigned to the logged-in user.
router.get(
  "/latest",
  authenticate,
  allowRoles("indexer", "teamLead"),
  getLatestGuide
);

// Saves acknowledgement for one guide version.
router.post(
  "/:id/acknowledge",
  authenticate,
  allowRoles("indexer", "teamLead"),
  acknowledgeGuide
);

// Gets version history for a project assigned to the user.
router.get(
  "/:projectId/history",
  authenticate,
  allowRoles("indexer", "teamLead"),
  getGuideHistory
);

// Downloads a guide only after authentication and role validation.
router.get(
  "/:id/download",
  authenticate,
  allowRoles("indexer", "teamLead"),
  downloadGuide
);

// Gets all clickable preview sections for one guide version.
router.get(
  "/:versionId/sections",
  authenticate,
  allowRoles(
    "indexer",
    "teamLead",
    "coreTeam",
    "administrator"
  ),
  getGuideSections
);

// UPDATE GUIDE SECTION
// Allows Guide Manager roles to update one section of a guide version.
router.put(
  "/:versionId/sections/:sectionId",
  authenticate,
  allowRoles(
    "coreTeam",
    "administrator"
  ),
  updateGuideSection
);

// Exports the Guide router for use in index.js.
module.exports = router;