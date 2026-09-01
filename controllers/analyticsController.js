// Imports the shared MySQL database connection.
const db = require("../config/db");


// ============================================================
// MONTH FILTER HELPER
// ============================================================

// Builds an optional SQL month filter from a YYYY-MM query parameter.
const getMonthFilter = (req, column = "production_date") => {
  // Reads the selected month from the request URL.
  const month = req.query.month;

  // Returns no filter when the frontend does not send a month.
  if (!month) {
    return {
      clause: "",
      params: [],
    };
  }

  // Validates that the month uses the YYYY-MM format.
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return {
      clause: "",
      params: [],
    };
  }

  // Filters rows to the requested production month.
  return {
    clause: `WHERE DATE_FORMAT(${column}, '%Y-%m') = ?`,
    params: [month],
  };
};


// ============================================================
// 1. ANALYTICS SUMMARY
// ============================================================

// Gets the main organisation-wide KPI summary for Core Team Analytics.
const getAnalyticsSummary = async (req, res) => {
  try {
    // Gets the optional month filter for the daily_entry production date.
    const monthFilter = getMonthFilter(
      req,
      "production_date"
    );

    // Calculates production totals for the selected month or all available data.
    const [productionRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(docs_received), 0) AS totalReceived,
        COALESCE(SUM(docs_completed), 0) AS totalCompleted,
        COUNT(DISTINCT production_date) AS productionDays
      FROM daily_entry
      ${monthFilter.clause}
      `,
      monthFilter.params
    );

    // Counts all currently active Indexers using the normalized role table.
    const [employeeRows] = await db.query(`
      SELECT
        COUNT(*) AS activeIndexers
      FROM users u
      INNER JOIN role r
        ON r.role_id = u.role_id
      WHERE r.code = 'indexer'
        AND u.status = 'active'
    `);

    // Converts the received total into a JavaScript number.
    const totalReceived = Number(
      productionRows[0].totalReceived || 0
    );

    // Converts the completed total into a JavaScript number.
    const totalCompleted = Number(
      productionRows[0].totalCompleted || 0
    );

    // Converts the production-day count into a JavaScript number.
    const productionDays = Number(
      productionRows[0].productionDays || 0
    );

    // Converts the active Indexer count into a JavaScript number.
    const activeIndexers = Number(
      employeeRows[0].activeIndexers || 0
    );

    // Calculates backlog from received minus completed production.
    const backlog = Math.max(
      totalReceived - totalCompleted,
      0
    );

    // Calculates the production completion percentage.
    const completionRate =
      totalReceived > 0
        ? Math.round(
            (totalCompleted / totalReceived) * 100
          )
        : 0;

    // Calculates average completed production per active Indexer per production day.
    const averageProductivity =
      activeIndexers > 0 && productionDays > 0
        ? Math.round(
            totalCompleted /
              (activeIndexers * productionDays)
          )
        : 0;

    // Returns the Analytics summary response.
    return res.status(200).json({
      success: true,

      summary: {
        totalReceived,
        totalCompleted,
        backlog,
        completionRate,
        averageProductivity,
        activeIndexers,
        productionDays,
      },
    });
  } catch (error) {
    // Logs Analytics summary errors in the backend terminal.
    console.error(
      "Analytics Summary Error:",
      error
    );

    // Returns an error response when Analytics summary loading fails.
    return res.status(500).json({
      success: false,
      message: "Failed to load analytics summary",
      error: error.message,
    });
  }
};


// ============================================================
// 2. MONTHLY ANALYTICS
// ============================================================

// Gets month-wise production Analytics data.
const getMonthlyAnalytics = async (req, res) => {
  try {
    // Groups production information by production month.
    const [monthly] = await db.query(`
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
        ) AS completed,

        GREATEST(
          COALESCE(SUM(docs_received), 0)
          -
          COALESCE(SUM(docs_completed), 0),
          0
        ) AS backlog

      FROM daily_entry

      GROUP BY
        DATE_FORMAT(
          production_date,
          '%Y-%m'
        ),
        DATE_FORMAT(
          production_date,
          '%b %Y'
        )

      ORDER BY month_key ASC
    `);

    // Converts MySQL numeric values into normal JavaScript numbers.
    const formattedMonthly = monthly.map(
      (item) => ({
        month_key: item.month_key,
        month_name: item.month_name,
        received: Number(item.received || 0),
        completed: Number(item.completed || 0),
        backlog: Number(item.backlog || 0),
      })
    );

    // Returns the monthly Analytics data.
    return res.status(200).json({
      success: true,
      count: formattedMonthly.length,
      monthly: formattedMonthly,
    });
  } catch (error) {
    // Logs monthly Analytics errors in the backend terminal.
    console.error(
      "Monthly Analytics Error:",
      error
    );

    // Returns the monthly Analytics error response.
    return res.status(500).json({
      success: false,
      message: "Failed to load monthly analytics",
      error: error.message,
    });
  }
};


// ============================================================
// 3. PROJECT COMPARISON
// ============================================================

// Gets production comparison information for every project.
// ============================================================
// 3. PROJECT COMPARISON
// ============================================================

// Gets production comparison information for every project.
const getProjectComparison = async (req, res) => {
  try {
    // Reads the optional YYYY-MM month selected by the frontend.
    const month = req.query.month;

    // Checks whether the supplied month uses the correct YYYY-MM format.
    const hasValidMonth =
      month && /^\d{4}-\d{2}$/.test(month);

    // Adds the month condition inside the LEFT JOIN so zero-production projects remain visible.
    const monthJoinCondition = hasValidMonth
      ? `AND DATE_FORMAT(de.production_date, '%Y-%m') = ?`
      : "";

    // Adds the selected month as a SQL parameter only when it is valid.
    const queryParams = hasValidMonth
      ? [month]
      : [];

    // Builds the complete Project Comparison SQL query.
    const projectComparisonQuery = `
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
        ) AS backlog,

        CASE
          WHEN COALESCE(
            SUM(de.docs_received),
            0
          ) > 0

          THEN ROUND(
            (
              COALESCE(
                SUM(de.docs_completed),
                0
              )
              /
              COALESCE(
                SUM(de.docs_received),
                0
              )
            ) * 100
          )

          ELSE 0
        END AS completion_rate

      FROM project p

      LEFT JOIN daily_entry de
        ON de.project_id = p.project_id
        ${monthJoinCondition}

      GROUP BY
        p.project_id,
        p.project_code,
        p.project_name

      ORDER BY
        completed DESC,
        p.project_name ASC
    `;

    // Executes the query and safely replaces the ? placeholder with the selected month.
    const [projects] = await db.query(
      projectComparisonQuery,
      queryParams
    );

    // Converts MySQL numeric values into normal JavaScript numbers.
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

        completion_rate: Number(
          project.completion_rate || 0
        ),
      })
    );

    // Returns the filtered or complete Project Comparison data.
    return res.status(200).json({
      success: true,
      count: formattedProjects.length,
      projects: formattedProjects,
    });
  } catch (error) {
    // Logs Project Comparison errors in the backend terminal.
    console.error(
      "Project Comparison Error:",
      error
    );

    // Returns the Project Comparison error response.
    return res.status(500).json({
      success: false,
      message: "Failed to load project comparison",
      error: error.message,
    });
  }
};
// ============================================================
// 4. TOP PERFORMERS
// ============================================================

// Gets the five highest-performing active Indexers for the selected month or all production data.
const getTopPerformers = async (req, res) => {
  try {
    // Reads the optional YYYY-MM month selected by the frontend.
    const month = req.query.month;

    // Checks whether the supplied month uses the correct YYYY-MM format.
    const hasValidMonth =
      month && /^\d{4}-\d{2}$/.test(month);

    // Adds the month condition inside the LEFT JOIN so active Indexers with no production remain visible.
    const monthJoinCondition = hasValidMonth
      ? `AND DATE_FORMAT(de.production_date, '%Y-%m') = ?`
      : "";

    // Supplies the selected month only when the month value is valid.
    const queryParams = hasValidMonth
      ? [month]
      : [];

    // Builds the Top Performers SQL query.
    const topPerformersQuery = `
      SELECT
        u.user_id AS id,
        u.emp_code AS employee_id,
        u.full_name AS name,

        COALESCE(
          SUM(de.docs_received),
          0
        ) AS received,

        COALESCE(
          SUM(de.docs_completed),
          0
        ) AS completed,

        COUNT(
          DISTINCT de.production_date
        ) AS production_days

      FROM users u

      INNER JOIN role r
        ON r.role_id = u.role_id

      LEFT JOIN daily_entry de
        ON de.user_id = u.user_id
        ${monthJoinCondition}

      WHERE r.code = 'indexer'
        AND u.status = 'active'

      GROUP BY
        u.user_id,
        u.emp_code,
        u.full_name

      ORDER BY
        completed DESC,
        u.full_name ASC

      LIMIT 5
    `;

    // Executes the Top Performers query with the optional month parameter.
    const [performers] = await db.query(
      topPerformersQuery,
      queryParams
    );

    // Formats each Indexer's production and productivity values.
    const formattedPerformers = performers.map(
      (performer) => {
        // Converts received production into a normal JavaScript number.
        const received = Number(
          performer.received || 0
        );

        // Converts completed production into a normal JavaScript number.
        const completed = Number(
          performer.completed || 0
        );

        // Converts production days into a normal JavaScript number.
        const productionDays = Number(
          performer.production_days || 0
        );

        // Calculates completed production as a percentage of received production.
        const productivity =
          received > 0
            ? Math.round(
                (completed / received) * 100
              )
            : 0;

        // Returns the formatted Indexer information.
        return {
          id: performer.id,
          employee_id: performer.employee_id,
          name: performer.name,
          received,
          completed,
          productionDays,
          productivity,

          // Calculates average completed documents per production day.
          averageDailyProductivity:
            productionDays > 0
              ? Math.round(
                  completed / productionDays
                )
              : 0,
        };
      }
    );

    // Returns the Top Performers list.
    return res.status(200).json({
      success: true,
      count: formattedPerformers.length,
      performers: formattedPerformers,
    });
  } catch (error) {
    // Logs Top Performers errors in the backend terminal.
    console.error(
      "Top Performers Error:",
      error
    );

    // Returns an error response when Top Performers cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load top performers",
      error: error.message,
    });
  }
};


// ============================================================
// 5. COMPLETED VS TARGET
// ============================================================

// Returns monthly completed production compared with configured production targets.
const getCompletedVsTarget = async (req, res) => {
  try {
    // Reads the optional YYYY-MM month selected by the frontend.
    const month = req.query.month;

    // Validates the optional month before using it in the SQL query.
    const hasValidMonth =
      month && /^\d{4}-\d{2}$/.test(month);

    // Adds a month condition only when a valid month was supplied.
    const monthCondition = hasValidMonth
      ? "WHERE months.month_key = ?"
      : "";

    // Supplies the selected month to the SQL placeholder when needed.
    const queryParams = hasValidMonth ? [month] : [];

    // Builds monthly production and target totals separately to avoid duplicate sums.
    const completedVsTargetQuery = `
      SELECT
        months.month_key,
        DATE_FORMAT(
          STR_TO_DATE(CONCAT(months.month_key, '-01'), '%Y-%m-%d'),
          '%b %Y'
        ) AS month_name,
        COALESCE(production.completed, 0) AS completed,
        COALESCE(targets.target, 0) AS target
      FROM (
        SELECT DISTINCT
          DATE_FORMAT(production_date, '%Y-%m') AS month_key
        FROM daily_entry

        UNION

        SELECT DISTINCT
          DATE_FORMAT(target_month, '%Y-%m') AS month_key
        FROM production_target
      ) months

      LEFT JOIN (
        SELECT
          DATE_FORMAT(production_date, '%Y-%m') AS month_key,
          SUM(docs_completed) AS completed
        FROM daily_entry
        GROUP BY DATE_FORMAT(production_date, '%Y-%m')
      ) production
        ON production.month_key = months.month_key

      LEFT JOIN (
        SELECT
          DATE_FORMAT(target_month, '%Y-%m') AS month_key,
          SUM(target_docs) AS target
        FROM production_target
        GROUP BY DATE_FORMAT(target_month, '%Y-%m')
      ) targets
        ON targets.month_key = months.month_key

      ${monthCondition}

      ORDER BY months.month_key ASC
    `;

    // Executes the completed-versus-target query.
    const [rows] = await db.query(
      completedVsTargetQuery,
      queryParams,
    );

    // Checks whether at least one production target exists in the database.
    const [[targetStatus]] = await db.query(`
      SELECT COUNT(*) AS target_count
      FROM production_target
    `);

    // Converts database values into frontend-safe numeric values.
    const trend = rows.map((row) => {
      // Converts the monthly completed-production value into a number.
      const completed = Number(row.completed || 0);

      // Converts the configured monthly target into a number.
      const target = Number(row.target || 0);

      // Calculates the percentage of the configured target achieved.
      const achievementRate =
        target > 0
          ? Math.round((completed / target) * 100)
          : 0;

      // Returns the monthly Analytics structure used by the frontend chart.
      return {
        month_key: row.month_key,
        month_name: row.month_name,
        completed,
        target,
        achievementRate,
      };
    });

    // Returns the completed-versus-target Analytics response.
    return res.status(200).json({
      success: true,
      targetConfigured: Number(targetStatus.target_count) > 0,
      count: trend.length,
      trend,
    });
  } catch (error) {
    // Logs unexpected Completed vs Target errors on the backend.
    console.error(
      "Completed Vs Target Analytics Error:",
      error,
    );

    // Returns a safe error response to the frontend.
    return res.status(500).json({
      success: false,
      message:
        "Failed to load completed versus target analytics",
    });
  }
};

// ============================================================
// 6. STATUS DISTRIBUTION
// ============================================================

// Gets organisation-wide completed, pending and in-review production distribution.
// ============================================================
// 6. STATUS DISTRIBUTION
// ============================================================

// Gets workflow-based completed, pending and in-review production distribution.
const getStatusDistribution = async (req, res) => {
  try {
    // Reads the optional YYYY-MM month selected by the frontend.
    const month = req.query.month;

    // Validates the month before using it in the SQL query.
    const hasValidMonth =
      month && /^\d{4}-\d{2}$/.test(month);

    // Builds the optional production-month condition.
    const monthCondition = hasValidMonth
      ? `AND DATE_FORMAT(de.production_date, '%Y-%m') = ?`
      : "";

    // Supplies the selected month only when a valid filter exists.
    const queryParams = hasValidMonth
      ? [month]
      : [];

    // Calculates workflow distribution using daily-entry status values.
    const [rows] = await db.query(
      `
      SELECT
        COALESCE(
          SUM(de.docs_received),
          0
        ) AS received,

        COALESCE(
          SUM(
            CASE
              WHEN de.status_id IN (3, 4)
              THEN de.docs_received
              ELSE 0
            END
          ),
          0
        ) AS completed,

        COALESCE(
          SUM(
            CASE
              WHEN de.status_id = 2
              THEN de.docs_received
              ELSE 0
            END
          ),
          0
        ) AS inReview

      FROM daily_entry de

      WHERE 1 = 1
      ${monthCondition}
      `,
      queryParams
    );

    // Converts total received production into a JavaScript number.
    const received = Number(
      rows[0].received || 0
    );

    // Converts reviewed or locked production into the Completed workflow bucket.
    const completed = Number(
      rows[0].completed || 0
    );

    // Converts submitted production into the In Review workflow bucket.
    const inReview = Number(
      rows[0].inReview || 0
    );

    // Treats the remaining received production as Pending.
    const pending = Math.max(
      received - completed - inReview,
      0
    );

    // Calculates the workflow completion percentage.
    const completionRate =
      received > 0
        ? Math.round(
            (completed / received) * 100
          )
        : 0;

    // Returns the workflow Status Distribution to the frontend.
    return res.status(200).json({
      success: true,

      distribution: {
        received,
        completed,
        pending,
        inReview,
        completionRate,
      },
    });
  } catch (error) {
    // Logs Status Distribution errors in the backend terminal.
    console.error(
      "Status Distribution Error:",
      error
    );

    // Returns an error response when Status Distribution cannot be loaded.
    return res.status(500).json({
      success: false,
      message:
        "Failed to load status distribution",
      error: error.message,
    });
  }
};


// ============================================================
// EXPORTS
// ============================================================

// Exports all Analytics controller functions for analyticsRoutes.js.
module.exports = {
  getAnalyticsSummary,
  getMonthlyAnalytics,
  getProjectComparison,
  getTopPerformers,
  getCompletedVsTarget,
  getStatusDistribution,
};