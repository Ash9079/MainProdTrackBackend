// Imports the MySQL database connection.
const db = require("../../config/db");


// ============================================================
// 1. CORE TEAM DASHBOARD SUMMARY
// ============================================================

// Gets the main Core Team dashboard summary cards.
const getCoreTeamDashboard = async (req, res) => {
  try {

    // --------------------------------------------------------
    // Total Received + Total Completed
    // --------------------------------------------------------
    const [productionRows] = await db.query(`
      SELECT
        COALESCE(SUM(docs_received), 0) AS totalReceived,
        COALESCE(SUM(docs_completed), 0) AS totalCompleted
      FROM daily_entry
    `);

    const totalReceived = Number(
      productionRows[0].totalReceived || 0
    );

    const totalCompleted = Number(
      productionRows[0].totalCompleted || 0
    );


    // --------------------------------------------------------
    // Project Backlog
    // --------------------------------------------------------
    const projectBacklog = Math.max(
      totalReceived - totalCompleted,
      0
    );


    // --------------------------------------------------------
    // Active Employees
    //
    // Counts all active users except Administrator.
    // --------------------------------------------------------
    const [employeeRows] = await db.query(`
      SELECT
        COUNT(*) AS activeEmployees
      FROM users u
      INNER JOIN role r
        ON r.role_id = u.role_id
      WHERE u.status = 'active'
        AND r.code <> 'admin'
    `);

    const activeEmployees = Number(
      employeeRows[0].activeEmployees || 0
    );


    // --------------------------------------------------------
    // Completion Rate
    // --------------------------------------------------------
    const completionRate =
      totalReceived > 0
        ? Math.round(
            (totalCompleted / totalReceived) * 100
          )
        : 0;


    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------
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

    console.error(
      "Core Team Dashboard Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load Core Team dashboard",
      error: error.message,
    });
  }
};


// ============================================================
// 2. MONTHLY PRODUCTION TREND
// ============================================================

// Gets received and completed production for the last 6 months.
const getMonthlyProductionTrend = async (req, res) => {
  try {
    // Confirms that this exact monthly-trend controller is being executed.
console.log("NEW MONTHLY TREND CONTROLLER RUNNING");

// Confirms which MySQL database the backend connection is actually using.
const [dbInfo] = await db.query("SELECT DATABASE() AS database_name");

// Prints the backend's active database name in the terminal.
console.log("BACKEND DATABASE:", dbInfo[0].database_name);

// Checks how many daily-entry rows the backend can currently see.
const [entryCount] = await db.query(
  "SELECT COUNT(*) AS total FROM daily_entry"
);

// Prints the number of daily-entry rows visible to the backend.
console.log("DAILY ENTRY COUNT:", entryCount[0].total);

    const [trend] = await db.query(`
      SELECT
        DATE_FORMAT(
          production_date,
          '%Y-%m'
        ) AS month_key,

        DATE_FORMAT(
          production_date,
          '%b %Y'
        ) AS month_name,

        COALESCE(
          SUM(docs_received),
          0
        ) AS received,

        COALESCE(
          SUM(docs_completed),
          0
        ) AS completed

      FROM daily_entry
      
      WHERE production_date IS NOT NULL

      GROUP BY
        DATE_FORMAT(
          production_date,
          '%Y-%m'
        ),

        DATE_FORMAT(
          production_date,
          '%b %Y'
        )

      ORDER BY
        month_key ASC
    `);
    // Shows exactly what MySQL returned for the monthly trend query.
        console.log("MONTHLY TREND DB RESULT:", trend);



    // Convert MySQL values to JavaScript numbers.
    const formattedTrend = trend.map((item) => ({
      month_key: item.month_key,
      month_name: item.month_name,
      received: Number(item.received || 0),
      completed: Number(item.completed || 0),
    }));


    return res.status(200).json({
      success: true,
      count: formattedTrend.length,
      trend: formattedTrend,
    });

  } catch (error) {

    console.error(
      "Monthly Production Trend Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load monthly production trend",
      error: error.message,
    });
  }
};


// ============================================================
// 3. BACKLOG BY PROJECT
// ============================================================

// Gets received, completed and backlog totals for every project.
const getBacklogByProject = async (req, res) => {
  try {

    const [projects] = await db.query(`
      SELECT
        p.project_id AS id,
        p.project_code,
        p.project_name,

        COALESCE(
          SUM(de.docs_received),
          0
        ) AS received,

        COALESCE(
          SUM(de.docs_completed),
          0
        ) AS completed,

        GREATEST(
          COALESCE(
            SUM(de.docs_received),
            0
          )
          -
          COALESCE(
            SUM(de.docs_completed),
            0
          ),
          0
        ) AS backlog

      FROM project p

      LEFT JOIN daily_entry de
        ON de.project_id = p.project_id

      GROUP BY
        p.project_id,
        p.project_code,
        p.project_name

      ORDER BY
        backlog DESC,
        p.project_name ASC
    `);


    const formattedProjects = projects.map(
      (project) => ({
        id: project.id,
        project_code: project.project_code,
        project_name: project.project_name,

        received: Number(
          project.received || 0
        ),

        completed: Number(
          project.completed || 0
        ),

        backlog: Number(
          project.backlog || 0
        ),
      })
    );


    return res.status(200).json({
      success: true,
      count: formattedProjects.length,
      projects: formattedProjects,
    });

  } catch (error) {

    console.error(
      "Backlog By Project Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load backlog by project",
      error: error.message,
    });
  }
};


// ============================================================
// 4. PENDING CORRECTIONS
// ============================================================

// Gets total correction requests currently waiting for review.
const getPendingCorrections = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT
        COUNT(*) AS pendingCorrections

      FROM correction_request cr

      INNER JOIN correction_status cs
        ON cs.status_id = cr.status_id

      WHERE cs.code = 'pending'
    `);


    const pendingCorrections = Number(
      rows[0].pendingCorrections || 0
    );


    return res.status(200).json({
      success: true,
      pendingCorrections,
    });

  } catch (error) {

    console.error(
      "Pending Corrections Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load pending corrections",
      error: error.message,
    });
  }
};


// ============================================================
// 5. GUIDE COMPLIANCE
// ============================================================

// Gets organisation-wide guide acknowledgement compliance.
const getGuideCompliance = async (req, res) => {
  try {

    /*
      Required acknowledgement means:

      1. User is an active Indexer.
      2. User is assigned to the project.
      3. Project has a guide.
      4. Guide has a latest version.
      5. Latest version requires acknowledgement.

      Acknowledged means the acknowledgement record
      exists and its status is 'read'.
    */

    const [rows] = await db.query(`
      SELECT

        COUNT(*) AS totalRequired,

        COALESCE(
          SUM(
            CASE
              WHEN ga.ack_id IS NOT NULL
                AND ga.status = 'read'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS acknowledged

      FROM project_assignment pa

      INNER JOIN users u
        ON u.user_id = pa.user_id

      INNER JOIN role r
        ON r.role_id = u.role_id
        AND r.code = 'indexer'

      INNER JOIN guide g
        ON g.project_id = pa.project_id

      INNER JOIN guide_version gv
        ON gv.guide_id = g.guide_id
        AND gv.is_latest = 1
        AND gv.requires_ack = 1

      LEFT JOIN guide_acknowledgement ga
        ON ga.version_id = gv.version_id
        AND ga.user_id = pa.user_id

      WHERE u.status = 'active'
    `);


    const totalRequired = Number(
      rows[0].totalRequired || 0
    );

    const acknowledged = Number(
      rows[0].acknowledged || 0
    );


    const pending = Math.max(
      totalRequired - acknowledged,
      0
    );


    const complianceRate =
      totalRequired > 0
        ? Math.round(
            (acknowledged / totalRequired) * 100
          )
        : 100;


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

    console.error(
      "Guide Compliance Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load guide compliance",
      error: error.message,
    });
  }
};


// ============================================================
// 6. MISSING DAILY ENTRIES
// ============================================================

// Gets active Indexers who have not submitted/created
// any production entry today.
const getMissingEntries = async (req, res) => {
  try {

    /*
      Excludes:

      - inactive users
      - non-Indexers
      - Indexers who already have a daily entry today
      - users whose attendance status says the day
        does not count as a production day
        (for example approved/planned leave)
    */

    const [employees] = await db.query(`
      SELECT
        u.user_id AS id,
        u.emp_code AS employee_id,
        u.full_name AS name,
        u.email

      FROM users u

      INNER JOIN role r
        ON r.role_id = u.role_id

      WHERE r.code = 'indexer'

        AND u.status = 'active'

        AND NOT EXISTS (
          SELECT 1

          FROM daily_entry de

          WHERE de.user_id = u.user_id

            AND de.production_date = CURDATE()
        )

        AND NOT EXISTS (
          SELECT 1

          FROM attendance a

          INNER JOIN attendance_status ats
            ON ats.status_id = a.status_id

          WHERE a.user_id = u.user_id

            AND a.att_date = CURDATE()

            AND ats.counts_as_production_day = 0
        )

      ORDER BY
        u.full_name ASC
    `);


    return res.status(200).json({
      success: true,
      count: employees.length,
      employees,
    });

  } catch (error) {

    console.error(
      "Missing Entries Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load missing entries",
      error: error.message,
    });
  }
};


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getCoreTeamDashboard,
  getMonthlyProductionTrend,
  getBacklogByProject,
  getPendingCorrections,
  getGuideCompliance,
  getMissingEntries,
};