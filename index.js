const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const morgan = require("morgan");

dotenv.config({ path: path.join(__dirname, ".env") });

const { writeLog, logsDir } = require("./utils/fileLogger");

const passenger =
  typeof globalThis.PhusionPassenger !== "undefined"
    ? globalThis.PhusionPassenger
    : null;

if (passenger) {
  passenger.configure({ autoInstall: false });
}

const requiredEnv = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
];

if (!passenger) {
  requiredEnv.push("PORT");
}

const missingEnv = requiredEnv.filter((key) => {
  const value = process.env[key];
  return value === undefined || String(value).trim() === "";
});

if (missingEnv.length > 0) {
  writeLog(
    "app-error.log",
    "FATAL",
    `[BOOT] Missing required environment variables: ${missingEnv.join(", ")}`,
  );
  writeLog(
    "app-error.log",
    "FATAL",
    "[BOOT] Set them in backend/.env on the CWP server, then restart the Node app.",
  );
  process.exit(1);
}

if (
  process.env.JWT_SECRET === "change_this_to_a_long_random_secret_on_cwp" ||
  process.env.JWT_SECRET === "your_secure_random_secret" ||
  String(process.env.JWT_SECRET).length < 32
) {
  writeLog(
    "app.log",
    "WARN",
    "[BOOT] JWT_SECRET is too short or still a placeholder. Use at least 32 random characters in production.",
  );
}

const db = require("./config/db");
const { ensureProjectVisibility } = require("./utils/ensureSchema");
const { sendError } = require("./utils/httpError");
const authRoutes = require("./routes/authRoutes");

const app = express();
const dashboardRoutes = require("./routes/indexer/dashboardRoutes");
const projectRoutes = require("./routes/projectRoutes");
const dailyEntryRoutes = require("./routes/dailyEntryRoutes");
const guideRoutes = require("./routes/guideRoutes");
const correctionRoutes = require("./routes/indexer/correctionRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const profileRoutes = require("./routes/profileRoutes");
const reportRoutes = require("./routes/reportRoutes");
const teamRoutes = require("./routes/teamLead/teamRoutes");
const teamLeadDashboardRoutes = require("./routes/teamLead/dashboardRoutes");
const teamLeadApprovalRoutes = require("./routes/teamLead/approvalRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const passwordRoutes = require("./routes/passwordRoutes");
const teamLeadLeaveRoutes = require("./routes/teamLead/leaveApprovalRoutes");
const coreTeamDashboardRoutes = require("./routes/coreTeam/dashboardRoutes");
const coreTeamAnalyticsRoutes = require("./routes/analyticsRoutes");
const coreTeamProjectMasterRoutes = require("./routes/projectMasterRoutes");
const coreTeamUserManagementRoutes = require("./routes/userManagementRoutes");
const coreTeamAssignmentMatrixRoutes = require("./routes/coreTeam/assignmentMatrixRoutes");
const indexerCorrectionRoutes = require("./routes/indexer/correctionRoutes");
const complianceRoutes = require("./routes/complianceRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const adminLockingRulesRoutes = require("./routes/administrator/lockingRulesRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const adminDashboardRoutes = require("./routes/administrator/dashboardRoutes");
const searchRoutes = require("./routes/searchRoutes");

app.set("trust proxy", 1);

// ── CORS ──────────────────────────────────────────────────────
// In production allow only the known frontend origin.
// In development also allow localhost on any port.
const ALLOWED_ORIGINS = [
  "https://prod.kavyaconsultancy.com",
  "https://prod.kavyaconsultancy.com/",
  "https://www.prod.kavyaconsultancy.com",
  "https://www.prod.kavyaconsultancy.com/",
  "http://prod.kavyaconsultancy.com",
  "http://www.prod.kavyaconsultancy.com",
];

const isLocalOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no Origin header (same-origin, Postman, health checks).
    if (!origin) return callback(null, true);
    // Always allow local Vite/dev origins, even if NODE_ENV=production in .env.
    if (isLocalOrigin(origin)) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' is not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "Accept",
    "X-HTTP-Method-Override",
  ],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// CWP Apache often drops PUT/PATCH/DELETE. The frontend sends POST with this header.
app.use((req, _res, next) => {
  const override = String(req.headers["x-http-method-override"] || "").toUpperCase();
  if (req.method === "POST" && ["PUT", "PATCH", "DELETE"].includes(override)) {
    req.method = override;
  }
  next();
});

app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms"),
);

app.get("/", (req, res) => {
  // In production keep the root response minimal — don't leak env/passenger info.
  res.json({
    success: true,
    message: "ProdTrack Backend API is running",
  });
});

app.get("/api/health/live", (req, res) => {
  res.json({
    success: true,
    api: "up",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 AS ok");
    res.json({
      success: true,
      api: "up",
      database: rows[0]?.ok === 1 ? "up" : "unknown",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return sendError(res, error, {
      context: "GET /api/health",
      message: "Database health check failed",
      status: 503,
      extra: {
        api: "up",
        database: "down",
      },
    });
  }
});

// /api/test-db is only available outside production to avoid leaking DB info.
if (process.env.NODE_ENV !== "production") {
  app.get("/api/test-db", async (req, res) => {
    try {
      const [rows] = await db.query("SELECT 1 + 1 AS result");
      res.json({
        success: true,
        message: "MySQL connected successfully",
        result: rows[0].result,
      });
    } catch (error) {
      return sendError(res, error, {
        context: "GET /api/test-db",
        message: "Database connection failed",
        status: 500,
      });
    }
  });
}

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/daily-entries", dailyEntryRoutes);
app.use("/api/guides", guideRoutes);
app.use("/api/corrections", correctionRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/team-lead", teamRoutes);
app.use("/api/team-lead", teamLeadDashboardRoutes);
app.use("/api/team-lead", teamLeadApprovalRoutes);
app.use("/api/leave-requests", leaveRoutes);
app.use("/api/password", passwordRoutes);
app.use("/api/team-lead", teamLeadLeaveRoutes);
app.use("/api/core-team", coreTeamDashboardRoutes);
app.use("/api/core-team", coreTeamAnalyticsRoutes);
app.use("/api/core-team", coreTeamProjectMasterRoutes);
app.use("/api/core-team", coreTeamUserManagementRoutes);
app.use("/api/core-team", coreTeamAssignmentMatrixRoutes);
app.use("/api/indexer/corrections", indexerCorrectionRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/admin", adminLockingRulesRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/search", searchRoutes);

const runAutoLock = async () => {
  try {
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

    if (result.affectedRows > 0) {
      writeLog(
        "app.log",
        "INFO",
        `Auto-lock: ${result.affectedRows} entr${result.affectedRows === 1 ? "y" : "ies"
        } locked`,
      );
    }
  } catch (error) {
    if (typeof db.logError === "function") {
      db.logError("Auto-lock scheduler query failed", error);
    } else {
      writeLog(
        "app-error.log",
        "ERROR",
        `Auto-lock scheduler error: ${error.message}`,
      );
    }
  }
};

runAutoLock();
setInterval(runAutoLock, 60 * 1000);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {
  let status = Number(err.status || err.statusCode || 500);
  let message =
    status >= 500 ? "Internal server error" : err.message || "Request failed";

  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    status = 400;
    message = "Invalid JSON in request body";
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    status = 400;
    message = "Uploaded file is too large";
  }

  if (res.headersSent) {
    writeLog(
      "app-error.log",
      "ERROR",
      `[API ERROR] ${req.method} ${req.originalUrl} (headers already sent)`,
      {
        status,
        message: err.message,
      },
    );
    return next(err);
  }

  return sendError(res, err, {
    context: `${req.method} ${req.originalUrl}`,
    message,
    status,
  });
});

process.on("uncaughtException", (error) => {
  writeLog(
    "app-error.log",
    "FATAL",
    `[FATAL] uncaughtException: ${error.message}`,
    {
      name: error.name,
      code: error.code,
      stack: error.stack,
    },
  );
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  writeLog("app-error.log", "FATAL", `[FATAL] unhandledRejection: ${message}`, {
    reason: reason instanceof Error ? reason.stack : reason,
  });
});

const PORT = Number(process.env.PORT) || 4400;
const HOST = process.env.HOST || "0.0.0.0";

const onListening = () => {
  writeLog(
    "app.log",
    "INFO",
    `[BOOT] ProdTrack API started | node=${process.version} passenger=${Boolean(
      passenger,
    )} cwd=${process.cwd()} logs=${logsDir}`,
  );
  writeLog(
    "app.log",
    "INFO",
    passenger
      ? "[BOOT] Listening via Phusion Passenger (CWP Node.js Selector)"
      : `[BOOT] Listening on http://${HOST}:${PORT}`,
  );
  writeLog(
    "app.log",
    "INFO",
    "[BOOT] Health: GET /api/health/live | DB: GET /api/health | GET /api/test-db",
  );
};

const bindServer = () =>
  passenger
    ? app.listen("passenger", onListening)
    : app.listen(PORT, HOST, onListening);

const startServer = async () => {
  try {
    await ensureProjectVisibility(db);
  } catch (error) {
    writeLog(
      "db-error.log",
      "ERROR",
      `[DB] Could not repair project visibility view: ${error.message}`,
    );
  }

  const server = bindServer();

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      writeLog(
        "app-error.log",
        "FATAL",
        `[BOOT] Port ${PORT} is already in use. Change PORT in .env or stop the other process.`,
      );
    } else {
      writeLog(
        "app-error.log",
        "FATAL",
        `[BOOT] Server failed to start: ${error.message}`,
        { code: error.code, stack: error.stack },
      );
    }
    process.exit(1);
  });
};

startServer();
