const express = require("express");
const router  = express.Router();

const { getAdminDashboard } = require("../../controllers/administrator/dashboardController");
const authMiddleware = require("../../middleware/authMiddleware");
const allowRoles    = require("../../middleware/roleMiddleware");

// GET /api/admin/dashboard  — admin only
router.get(
  "/dashboard",
  authMiddleware,
  allowRoles("administrator"),
  getAdminDashboard
);

module.exports = router;
