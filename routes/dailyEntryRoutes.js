const express = require("express");

const authenticate = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  createEntry,
  getMyEntries,
  updateEntry,
  getPendingTeamEntries,
  reviewEntry,
} = require("../controllers/dailyEntryController");

const router = express.Router();

router.get(
  "/team/pending",
  authenticate,
  allowRoles("teamLead"),
  getPendingTeamEntries
);

router.get(
  "/my",
  authenticate,
  allowRoles("indexer","teamLead"),
  getMyEntries
);

router.post(
  "/",
  authenticate,
  allowRoles("indexer","teamLead"),
  createEntry
);

router.patch(
  "/:id",
  authenticate,
  allowRoles("indexer", "teamLead"),
  updateEntry
);

router.patch(
  "/:id/review",
  authenticate,
  allowRoles("teamLead"),
  reviewEntry
);

module.exports = router;