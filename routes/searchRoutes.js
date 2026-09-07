// Imports Express for creating the search route.
const express = require("express");

// Imports JWT authentication middleware.
const authenticate = require("../middleware/authMiddleware");

// Imports the global search controller.
const {
  globalSearch,
} = require("../controllers/searchController");

// Creates the Express router.
const router = express.Router();

// Handles authenticated global search requests.
router.get("/", authenticate, globalSearch);

// Exports the router.
module.exports = router;