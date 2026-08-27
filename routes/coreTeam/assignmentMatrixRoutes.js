const express = require("express");

const authenticate =
  require("../../middleware/authMiddleware");

const allowRoles =
  require("../../middleware/roleMiddleware");

const {
  getAssignmentMatrix,
  saveAssignmentMatrix,
} = require(
  "../../controllers/coreTeam/assignmentMatrixController"
);

const router = express.Router();


// ============================================================
// GET ASSIGNMENT MATRIX
// ============================================================

router.get(
  "/assignment-matrix",
  authenticate,
  allowRoles(
    "coreTeam",
    "administrator"
  ),
  getAssignmentMatrix
);


// ============================================================
// SAVE ASSIGNMENT MATRIX
// ============================================================

router.put(
  "/assignment-matrix",
  authenticate,
  allowRoles(
    "coreTeam",
    "administrator"
  ),
  saveAssignmentMatrix
);


module.exports = router;