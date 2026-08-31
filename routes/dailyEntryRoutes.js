const express = require("express");

const authenticate = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const {
  createEntry,
  getMyEntries,
  updateEntry,
} = require("../controllers/dailyEntryController");

const router = express.Router();

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

module.exports = router;