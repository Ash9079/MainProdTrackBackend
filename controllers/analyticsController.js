const db = require("../config/db");


// ============================================================
// 1. ANALYTICS SUMMARY
// ============================================================

const getAnalyticsSummary = async (req, res) => {
  try {
    // Current-month production, matching the UI cards:
    // Received (mo.), Completed (mo.), Backlog, Avg. productivity.
    const [rows] = await db.query(`
      SELECT
        COALESCE(SUM(docs_received), 0) AS totalReceived,
        COALESCE(SUM(docs_completed), 0) AS totalCompleted,
        COUNT(DISTINCT production_date) AS productionDays
      FROM daily_entry
      WHERE YEAR(production_date) = YEAR(CURDATE())
        AND MONTH(production_date) = MONTH(CURDATE())
    `);

    const totalReceived = Number(
      rows[0].totalReceived || 0
    );

    const totalCompleted = Number(
      rows[0].totalCompleted || 0
    );

    const productionDays = Number(
      rows[0].productionDays || 0
    );

    const backlog = Math.max(
      totalReceived - totalCompleted,
      0
    );

    // Productivity percentage based on actual schema/view logic.
    const averageProductivity =
      totalReceived > 0
        ? Math.round(
            (totalCompleted / totalReceived) * 100
          )
        : 0;

    const completionRate = averageProductivity;

    const [employeeRows] = await db.query(`
      SELECT COUNT(*) AS activeIndexers
      FROM users u
      INNER JOIN role r
        ON r.role_id = u.role_id
      WHERE r.code = 'indexer'
        AND u.status = 'active'
    `);

    const activeIndexers = Number(
      employeeRows[0].activeIndexers || 0
    );

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
    console.error(
      "Analytics Summary Error:",
      error
    );

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

const getMonthlyAnalytics = async (req, res) => {
  try {
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

    const formattedMonthly = monthly.map(
      (item) => ({
        month_key: item.month_key,
        month_name: item.month_name,
        received: Number(item.received || 0),
        completed: Number(item.completed || 0),
        backlog: Number(item.backlog || 0),
      })
    );

    return res.status(200).json({
      success: true,
      count: formattedMonthly.length,
      monthly: formattedMonthly,
    });

  } catch (error) {
    console.error(
      "Monthly Analytics Error:",
      error
    );

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

const getProjectComparison = async (req, res) => {
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

      GROUP BY
        p.project_id,
        p.project_code,
        p.project_name

      ORDER BY
        completed DESC,
        p.project_name ASC
    `);

    const formattedProjects = projects.map(
      (project) => ({
        id: project.id,
        project_code: project.project_code,
        project_name: project.project_name,
        received: Number(project.received || 0),
        completed: Number(project.completed || 0),
        backlog: Number(project.backlog || 0),
        completion_rate: Number(
          project.completion_rate || 0
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
      "Project Comparison Error:",
      error
    );

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

const getTopPerformers = async (req, res) => {
  try {
    const [performers] = await db.query(`
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

      WHERE r.code = 'indexer'
        AND u.status = 'active'

      GROUP BY
        u.user_id,
        u.emp_code,
        u.full_name

      ORDER BY completed DESC

      LIMIT 5
    `);

    const formattedPerformers = performers.map(
      (performer) => {
        const received = Number(
          performer.received || 0
        );

        const completed = Number(
          performer.completed || 0
        );

        const productionDays = Number(
          performer.production_days || 0
        );

        const productivity =
          received > 0
            ? Math.round(
                (completed / received) * 100
              )
            : 0;

        return {
          id: performer.id,
          employee_id: performer.employee_id,
          name: performer.name,
          received,
          completed,
          productionDays,
          productivity,

          averageDailyProductivity:
            productionDays > 0
              ? Math.round(
                  completed / productionDays
                )
              : 0,
        };
      }
    );

    return res.status(200).json({
      success: true,
      count: formattedPerformers.length,
      performers: formattedPerformers,
    });

  } catch (error) {
    console.error(
      "Top Performers Error:",
      error
    );

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

const getCompletedVsTarget = async (req, res) => {
  try {
    /*
      IMPORTANT:

      The current dpta database does not contain a
      production_target / production_targets table.

      Therefore this API returns real completed production,
      but target remains 0 until target configuration is
      added to the database.
    */

    const [trend] = await db.query(`
      SELECT
        production_date,

        COALESCE(
          SUM(docs_completed),
          0
        ) AS completed

      FROM daily_entry

      WHERE production_date >=
        DATE_SUB(CURDATE(), INTERVAL 30 DAY)

      GROUP BY production_date

      ORDER BY production_date ASC
    `);

    const formattedTrend = trend.map(
      (item) => ({
        production_date: item.production_date,
        completed: Number(
          item.completed || 0
        ),

        // No target source exists in current schema.
        target: 0,
      })
    );

    return res.status(200).json({
      success: true,
      targetConfigured: false,

      message:
        "Production target is not configured in the current database schema",

      count: formattedTrend.length,
      trend: formattedTrend,
    });

  } catch (error) {
    console.error(
      "Completed Vs Target Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load completed vs target",
      error: error.message,
    });
  }
};


// ============================================================
// 6. STATUS DISTRIBUTION
// ============================================================

const getStatusDistribution = async (req, res) => {
  try {
    /*
      Production workflow:

      draft
        → not finished

      submitted
        → waiting for review

      reviewed / locked
        → completed workflow
    */

    const [rows] = await db.query(`
      SELECT

        COALESCE(
          SUM(de.docs_received),
          0
        ) AS received,

        COALESCE(
          SUM(
            CASE
              WHEN es.code IN (
                'reviewed',
                'locked'
              )
              THEN de.docs_completed
              ELSE 0
            END
          ),
          0
        ) AS completed,

        COALESCE(
          SUM(
            CASE
              WHEN es.code = 'submitted'
              THEN de.docs_completed
              ELSE 0
            END
          ),
          0
        ) AS inReview

      FROM daily_entry de

      INNER JOIN entry_status es
        ON es.status_id = de.status_id
    `);

    const received = Number(
      rows[0].received || 0
    );

    const completed = Number(
      rows[0].completed || 0
    );

    const inReview = Number(
      rows[0].inReview || 0
    );

    const pending = Math.max(
      received - completed - inReview,
      0
    );

    const completionRate =
      received > 0
        ? Math.round(
            (completed / received) * 100
          )
        : 0;

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
    console.error(
      "Status Distribution Error:",
      error
    );

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

module.exports = {
  getAnalyticsSummary,
  getMonthlyAnalytics,
  getProjectComparison,
  getTopPerformers,
  getCompletedVsTarget,
  getStatusDistribution,
};