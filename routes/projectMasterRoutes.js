// Imports Express so Core Team Project Master routes can be created.
const express = require("express");

// Imports JWT authentication middleware to verify the logged-in user.
const authenticate = require("../middleware/authMiddleware");

// Imports role middleware to restrict Project Master to Core Team users.
const allowRoles = require("../middleware/roleMiddleware");

// Imports all Core Team Project Master controller functions.
const {
  getAllProjects,
  createProject,
  updateProject,
  getTeamLeads,
  getReportingCategories,
} = require("../controllers/projectMasterController");

// Creates an Express router for Core Team Project Master APIs.
const router = express.Router();


// Gets all projects for the Project Master table.
router.get(
  "/projects",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getAllProjects
);


// Gets active Team Leads for the Assigned Team dropdown.
router.get(
  "/projects/team-leads",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getTeamLeads
);


// Creates a new project from the Project Master popup.
router.post(
  "/projects",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  createProject
);


// Updates an existing Project Master record.
router.patch(
  "/projects/:id",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  updateProject
);

router.get(
  "/projects/reporting-categories",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getReportingCategories
);

// Exports the Project Master router so index.js can register it.
module.exports = router;