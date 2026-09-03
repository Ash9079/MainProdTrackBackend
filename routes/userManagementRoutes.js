// Imports Express so Core Team user-management routes can be created.
const express = require("express");

// Imports JWT authentication middleware to verify the logged-in user.
const authenticate = require("../middleware/authMiddleware");

// Imports role middleware to restrict management APIs to Core Team.
const allowRoles = require("../middleware/roleMiddleware");

// Imports all Core Team user-management controller functions.
const {
  getAllUsers,
  getUserTeamLeads,
  getUserProjects,
  getUserDepartments,
  createUser,
  updateUser,
} = require("../controllers/userManagementController");

// Creates an Express router for Core Team Users APIs.
const router = express.Router();


// Gets all users displayed on the Core Team Users screen.
router.get(
  "/users",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getAllUsers
);


// Gets active Team Leads for the User Details dropdown.
router.get(
  "/users/team-leads",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getUserTeamLeads
);


// Gets active projects for the Assigned Projects dropdown.
router.get(
  "/users/projects",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getUserProjects
);

// Gets departments from the database for the Department dropdown.
router.get(
  "/users/departments",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  getUserDepartments
);


// Creates a new user from the Add User popup.
router.post(
  "/users",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  createUser
);


// Updates an existing employee from the Edit User popup.
router.patch(
  "/users/:id",
  authenticate,
  allowRoles("coreTeam", "administrator"),
  updateUser
);


// Exports the Core Team Users router so index.js can use it.
module.exports = router;