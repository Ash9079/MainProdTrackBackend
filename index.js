const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const db = require("./config/db");
const authRoutes = require("./routes/authRoutes");

const app = express();
const dashboardRoutes = require("./routes/indexer/dashboardRoutes");
// Imports Project routes 
const projectRoutes = require("./routes/projectRoutes");
// Imports dailyEntry routes 
const dailyEntryRoutes = require("./routes/dailyEntryRoutes");
// Imports guideRoutes routes
const guideRoutes = require("./routes/guideRoutes");
// Imports correction request routes
const correctionRoutes = require("./routes/indexer/correctionRoutes");
// Imports attendance routes
const attendanceRoutes = require("./routes/attendanceRoutes");
// Imports notification routes
const notificationRoutes = require("./routes/notificationRoutes");
// Imports profile routes
const profileRoutes = require("./routes/profileRoutes");
// Imports report routes
const reportRoutes = require("./routes/reportRoutes");
// Imports Team Lead team routes
const teamRoutes = require("./routes/teamLead/teamRoutes");
//handle teamlead dashbaords 
const teamLeadDashboardRoutes = require("./routes/teamLead/dashboardRoutes");
//
const teamLeadApprovalRoutes = require("./routes/teamLead/approvalRoutes");
//Imports leave routes 
const leaveRoutes = require("./routes/leaveRoutes");
//password reset routes
const passwordRoutes = require("./routes/passwordRoutes");
// Imports the Team Lead leave approval routes.
const teamLeadLeaveRoutes = require("./routes/teamLead/leaveApprovalRoutes");
// Imports Core Team dashboard routes.
const coreTeamDashboardRoutes = require("./routes/coreTeam/dashboardRoutes");
// Imports Core Team Analytics routes.
const coreTeamAnalyticsRoutes = require("./routes/analyticsRoutes");
// Imports Core Team Project Master routes.
const coreTeamProjectMasterRoutes = require("./routes/projectMasterRoutes");
// Imports Core Team user-management routes.
const coreTeamUserManagementRoutes = require("./routes/userManagementRoutes");
// Imports Core Team Assignment Matrix routes.
const coreTeamAssignmentMatrixRoutes = require("./routes/coreTeam/assignmentMatrixRoutes");
const indexerCorrectionRoutes = require( "./routes/indexer/correctionRoutes");
const complianceRoutes = require( "./routes/complianceRoutes");
const auditLogRoutes = require( "./routes/auditLogRoutes");
// Imports Administrator Daily Entry Locking Rules routes.
const adminLockingRulesRoutes = require("./routes/administrator/lockingRulesRoutes");
const settingsRoutes = require(
  "./routes/settingsRoutes"
);

// Imports Administrator dashboard routes
const adminDashboardRoutes = require("./routes/administrator/dashboardRoutes");
// Imports global search routes.
const searchRoutes = require("./routes/searchRoutes");


// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());

app.use(express.json());

// ============================================
// BASIC TEST ROUTE
// ============================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ProdTrack Backend API is running",
  });
});

// ============================================
// MYSQL TEST ROUTE
// ============================================

app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT 1 + 1 AS result"
    );

    res.json({
      success: true,
      message: "MySQL connected successfully",
      result: rows[0].result,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// ============================================
// API ROUTES
// ============================================
// Authentication
app.use("/api/auth", authRoutes);
// Projects
app.use("/api/projects", projectRoutes);
// Daily production entries
app.use("/api/daily-entries", dailyEntryRoutes);
// Guides and acknowledgement
app.use("/api/guides", guideRoutes);
// Handles correction request APIs
app.use("/api/corrections", correctionRoutes);
// Handles attendance APIs
app.use("/api/attendance", attendanceRoutes);
// Handles notification APIs
app.use("/api/notifications", notificationRoutes);
// Handles profile APIs
app.use("/api/profile", profileRoutes);
// Handles report APIs
app.use("/api/reports", reportRoutes);
// Handles dashboard APIs
app.use("/api/dashboard", dashboardRoutes);
// Handles Team Lead team APIs
app.use("/api/team-lead", teamRoutes);
// Handles Team Lead Dashboards APIs
app.use( "/api/team-lead",teamLeadDashboardRoutes);
// Handles team lead Approvals 
app.use("/api/team-lead", teamLeadApprovalRoutes);
// Handles leave request APIs
app.use("/api/leave-requests", leaveRoutes);
// Handles resetpassword APIs
app.use("/api/password", passwordRoutes);
// Registers all Team Lead leave approval APIs under /api/team-lead.
app.use("/api/team-lead", teamLeadLeaveRoutes);
// Registers Core Team dashboard APIs under /api/core-team.
app.use("/api/core-team",coreTeamDashboardRoutes);
// Registers Core Team Analytics APIs under /api/core-team.
app.use("/api/core-team",coreTeamAnalyticsRoutes);
// Registers Core Team Project Master APIs under /api/core-team.
app.use("/api/core-team",coreTeamProjectMasterRoutes);
// Registers Core Team user-management APIs under /api/core-team.
app.use("/api/core-team",coreTeamUserManagementRoutes);
// Registers Core Team Assignment Matrix APIs under /api/core-team.
app.use("/api/core-team", coreTeamAssignmentMatrixRoutes);

app.use("/api/indexer/corrections",indexerCorrectionRoutes);

app.use("/api/compliance",complianceRoutes);

app.use("/api/audit-logs",auditLogRoutes);
// Mounts Administrator Daily Entry Locking Rules APIs.
app.use("/api/admin", adminLockingRulesRoutes);

app.use("/api/audit-logs",auditLogRoutes);

app.use("/api/settings",settingsRoutes);

// Registers Administrator dashboard APIs under /api/admin
app.use("/api/admin",adminDashboardRoutes);
// Registers the global search API.
app.use("/api/search", searchRoutes);

// ============================================
// AUTO-LOCK SCHEDULER
// ============================================

// Checks every minute whether submitted/reviewed entries have reached
// their project's configured auto-lock time plus grace period.
const runAutoLock = async () => {
  try {
    // Locks today's eligible entries when their configured lock time has passed.
    const [result] = await db.query(`
      UPDATE daily_entry de

      JOIN project p
        ON p.project_id = de.project_id

      JOIN entry_status current_status
        ON current_status.status_id = de.status_id

      SET
        de.status_id = (
          SELECT locked_status.status_id
          FROM entry_status locked_status
          WHERE locked_status.code = 'locked'
          LIMIT 1
        ),
        de.locked_at = NOW()

      WHERE de.production_date = CURDATE()

        AND current_status.code IN (
          'submitted',
          'reviewed'
        )

        AND p.auto_lock_time IS NOT NULL

        AND CURTIME() >= ADDTIME(
          p.auto_lock_time,
          SEC_TO_TIME(
            p.grace_minutes * 60
          )
        )
    `);

    // Logs only when at least one entry was automatically locked.
    if (result.affectedRows > 0) {
      console.log(
        `Auto-lock: ${result.affectedRows} entr${
          result.affectedRows === 1
            ? "y"
            : "ies"
        } locked`
      );
    }
  } catch (error) {
    // Logs scheduler errors without stopping the backend server.
    console.error(
      "Auto-lock scheduler error:",
      error
    );
  }
};

// Runs the auto-lock check once when the backend starts.
runAutoLock();

// Runs the auto-lock check every 60 seconds.
setInterval(
  runAutoLock,
  60 * 1000
);

// ============================================
// SERVER
// ============================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `ProdTrack Backend API running on http://localhost:${PORT}`
  );
});

