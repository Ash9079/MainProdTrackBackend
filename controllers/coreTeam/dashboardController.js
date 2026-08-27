// Imports the MySQL database connection.
const db = require("../../config/db");


// Gets the main Core Team dashboard summary cards.
const getCoreTeamDashboard = async (req, res) => {
  try {
    // Calculates total received and completed production across all employees and projects.
    const [productionRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(documents_received), 0) AS totalReceived,
        COALESCE(SUM(documents_completed), 0) AS totalCompleted
      FROM daily_entries
      `
    );

    // Counts all currently active users except administrator accounts.
    const [employeeRows] = await db.query(
      `
      SELECT COUNT(*) AS activeEmployees
      FROM users
      WHERE status = 'active'
        AND role != 'administrator'
      `
    );

    // Converts total received production into a JavaScript number.
    const totalReceived = Number(
      productionRows[0].totalReceived
    );

    // Converts total completed production into a JavaScript number.
    const totalCompleted = Number(
      productionRows[0].totalCompleted
    );

    // Calculates the organisation-wide backlog from received minus completed.
    const projectBacklog = Math.max(
      totalReceived - totalCompleted,
      0
    );

    // Converts the active employee count into a JavaScript number.
    const activeEmployees = Number(
      employeeRows[0].activeEmployees
    );

    // Calculates the organisation-wide completion percentage.
    const completionRate =
      totalReceived > 0
        ? Math.round(
            (totalCompleted / totalReceived) * 100
          )
        : 0;

    // Returns the main Core Team dashboard summary values.
    return res.status(200).json({
      success: true,

      dashboard: {
        totalReceived,
        totalCompleted,
        projectBacklog,
        activeEmployees,
        completionRate,
      },
    });

  } catch (error) {
    // Logs the actual dashboard error in the backend terminal.
    console.error(
      "Core Team Dashboard Error:",
      error
    );

    // Returns an error response when Core Team dashboard data cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load Core Team dashboard",
      error: error.message,
    });
  }
};

// Gets monthly received and completed production across the organisation.
const getMonthlyProductionTrend = async (req, res) => {
  try {
    // Groups all production records by month for the last 6 months.
    const [trend] = await db.query(
      `
      SELECT
        DATE_FORMAT(production_date, '%Y-%m') AS month_key,
        DATE_FORMAT(production_date, '%b %Y') AS month_name,

        COALESCE(
          SUM(documents_received),
          0
        ) AS received,

        COALESCE(
          SUM(documents_completed),
          0
        ) AS completed

      FROM daily_entries

      WHERE production_date >=
        DATE_SUB(CURDATE(), INTERVAL 5 MONTH)

      GROUP BY
        DATE_FORMAT(production_date, '%Y-%m'),
        DATE_FORMAT(production_date, '%b %Y')

      ORDER BY
        month_key ASC
      `
    );

    // Returns organisation-wide monthly production trend data.
    return res.status(200).json({
      success: true,
      count: trend.length,
      trend,
    });

  } catch (error) {
    // Logs monthly production trend errors in the backend terminal.
    console.error(
      "Monthly Production Trend Error:",
      error
    );

    // Returns an error when monthly production trend cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load monthly production trend",
      error: error.message,
    });
  }
};


// Gets current backlog totals grouped by project.
const getBacklogByProject = async (req, res) => {
  try {
    // Calculates received, completed, and backlog for every project.
    const [projects] = await db.query(
      `
      SELECT
        p.id,
        p.project_code,
        p.project_name,

        COALESCE(
          SUM(de.documents_received),
          0
        ) AS received,

        COALESCE(
          SUM(de.documents_completed),
          0
        ) AS completed,

        GREATEST(
          COALESCE(
            SUM(de.documents_received),
            0
          )
          -
          COALESCE(
            SUM(de.documents_completed),
            0
          ),
          0
        ) AS backlog

      FROM projects p

      LEFT JOIN daily_entries de
        ON de.project_id = p.id

      GROUP BY
        p.id,
        p.project_code,
        p.project_name

      ORDER BY
        backlog DESC
      `
    );

    // Returns project-wise backlog information for the dashboard.
    return res.status(200).json({
      success: true,
      count: projects.length,
      projects,
    });

  } catch (error) {
    // Logs project backlog errors in the backend terminal.
    console.error(
      "Backlog By Project Error:",
      error
    );

    // Returns an error when project backlog cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load backlog by project",
      error: error.message,
    });
  }
};

// Gets the total number of pending correction requests across the organisation.
const getPendingCorrections = async (req, res) => {
  try {
    // Counts all correction requests that are still waiting for review.
    const [rows] = await db.query(
      `
      SELECT COUNT(*) AS pendingCorrections
      FROM correction_requests
      WHERE status = 'PENDING'
      `
    );

    // Returns the pending correction count.
    return res.status(200).json({
      success: true,
      pendingCorrections: Number(rows[0].pendingCorrections),
    });
  } catch (error) {
    // Logs pending correction errors in the backend terminal.
    console.error("Pending Corrections Error:", error);

    // Returns an error when pending correction data cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load pending corrections",
      error: error.message,
    });
  }
};


// Gets organisation-wide guide acknowledgement compliance.
const getGuideCompliance = async (req, res) => {
  try {
    // Counts required guide acknowledgements for assigned active guides.
    const [rows] = await db.query(
      `
      SELECT
        COUNT(*) AS totalRequired,

        SUM(
          CASE
            WHEN ga.id IS NOT NULL THEN 1
            ELSE 0
          END
        ) AS acknowledged

      FROM user_project_assignments upa

      JOIN users u
        ON u.id = upa.user_id
        AND u.role = 'indexer'
        AND u.status = 'active'

      JOIN guides g
        ON g.project_id = upa.project_id
        AND g.status = 'active'

      LEFT JOIN guide_acknowledgements ga
        ON ga.guide_id = g.id
        AND ga.user_id = upa.user_id
      `
    );

    // Converts the total required acknowledgements into a number.
    const totalRequired = Number(rows[0].totalRequired || 0);

    // Converts the completed acknowledgement count into a number.
    const acknowledged = Number(rows[0].acknowledged || 0);

    // Calculates how many required acknowledgements are still pending.
    const pending = Math.max(totalRequired - acknowledged, 0);

    // Calculates the overall guide compliance percentage.
    const complianceRate =
      totalRequired > 0
        ? Math.round((acknowledged / totalRequired) * 100)
        : 100;

    // Returns organisation-wide guide compliance values.
    return res.status(200).json({
      success: true,
      compliance: {
        totalRequired,
        acknowledged,
        pending,
        complianceRate,
      },
    });
  } catch (error) {
    // Logs guide compliance errors in the backend terminal.
    console.error("Guide Compliance Error:", error);

    // Returns an error when guide compliance cannot be calculated.
    return res.status(500).json({
      success: false,
      message: "Failed to load guide compliance",
      error: error.message,
    });
  }
};


// Gets active Indexers who have not submitted a daily entry today.
const getMissingEntries = async (req, res) => {
  try {
    // Finds active Indexers with no daily entry for today's production date.
    const [employees] = await db.query(
      `
      SELECT
        u.id,
        u.employee_id,
        u.name,
        u.email

      FROM users u

      WHERE u.role = 'indexer'
        AND u.status = 'active'

        AND NOT EXISTS (
          SELECT 1

          FROM daily_entries de

          WHERE de.user_id = u.id
            AND DATE(de.production_date) = CURDATE()
        )

        AND NOT EXISTS (
          SELECT 1

          FROM leave_requests lr

          WHERE lr.user_id = u.id
            AND lr.status = 'APPROVED'
            AND CURDATE() BETWEEN lr.start_date AND lr.end_date
        )

      ORDER BY u.name ASC
      `
    );

    // Returns employees who are missing today's daily entry.
    return res.status(200).json({
      success: true,
      count: employees.length,
      employees,
    });
  } catch (error) {
    // Logs missing-entry errors in the backend terminal.
    console.error("Missing Entries Error:", error);

    // Returns an error when missing-entry data cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load missing entries",
      error: error.message,
    });
  }
};


// Exports Core Team dashboard functions so the routes can use them.
module.exports = {
  getCoreTeamDashboard,
  getMonthlyProductionTrend,
  getBacklogByProject,
   getPendingCorrections,
  getGuideCompliance,
  getMissingEntries,
};