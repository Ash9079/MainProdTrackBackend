// Imports Express to create the Administrator Locking Rules router.
const express = require("express");

// Imports authentication middleware to verify the logged-in user.
const authenticate = require("../../middleware/authMiddleware");

// Imports role middleware to restrict these APIs to Administrator users.
const allowRoles = require("../../middleware/roleMiddleware");

// Imports the Administrator Locking Rules controller.
const {
    getLockingRules,
    updateLockingRules

} = require("../../controllers/administrator/lockingRulesController");

// Creates the Administrator Locking Rules router.
const router = express.Router();

// Gets the global rules and project-specific auto-lock settings.
router.get(
  "/locking-rules",
  authenticate,
  allowRoles("administrator"),
  getLockingRules

);
// Updates global locking rules and project-specific auto-lock configuration.
router.put(
  "/locking-rules",
  authenticate,
  allowRoles("administrator"),
  updateLockingRules
);

// Exports the router for use by the main backend application.
module.exports = router;