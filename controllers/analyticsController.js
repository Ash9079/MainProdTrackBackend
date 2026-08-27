// Imports the MySQL database connection.
const db = require("../config/db");


// Gets the main organisation-wide KPI summary for Core Team.
const getAnalyticsSummary = async (req, res) => {
  try {
    // Calculates production totals across all daily entries.
    const [productionRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(documents_received), 0) AS totalReceived,
        COALESCE(SUM(documents_completed), 0) AS totalCompleted,
        COUNT(DISTINCT production_date) AS productionDays
      FROM daily_entries
      `
    );

    // Counts active Indexers used for productivity calculations.
    const [employeeRows] = await db.query(
      `
      SELECT COUNT(*) AS activeIndexers
      FROM users
      WHERE role = 'indexer'
        AND status = 'active'
      `
    );

    // Converts received production into a JavaScript number.
    const totalReceived = Number(
      productionRows[0].totalReceived
    );

    // Converts completed production into a JavaScript number.
    const totalCompleted = Number(
      productionRows[0].totalCompleted
    );

    // Converts production day count into a JavaScript number.
    const productionDays = Number(
      productionRows[0].productionDays
    );

    // Converts active Indexer count into a JavaScript number.
    const activeIndexers = Number(
      employeeRows[0].activeIndexers
    );

    // Calculates current backlog from received minus completed.
    const backlog = Math.max(
      totalReceived - totalCompleted,
      0
    );

    // Calculates overall completion percentage.
    const completionRate =
      totalReceived > 0
        ? Math.round(
            (totalCompleted / totalReceived) * 100
          )
        : 0;

    // Calculates average completed work per active Indexer per production day.
    const averageProductivity =
      activeIndexers > 0 && productionDays > 0
        ? Math.round(
            totalCompleted /
              (activeIndexers * productionDays)
          )
        : 0;

    // Returns the organisation-wide Analytics KPI cards.
    return res.status(200).json({
      success: true,

      summary: {
        totalReceived,
        totalCompleted,
        backlog,
        completionRate,
        activeIndexers,
        productionDays,
        averageProductivity,
      },
    });
  } catch (error) {
    // Logs Analytics summary errors in the backend terminal.
    console.error("Analytics Summary Error:", error);

    // Returns an error when Analytics summary cannot be calculated.
    return res.status(500).json({
      success: false,
      message: "Failed to load analytics summary",
      error: error.message,
    });
  }
};


// Gets monthly received, completed, and backlog production.
const getMonthlyAnalytics = async (req, res) => {
  try {
    // Groups organisation-wide production by month.
    const [monthly] = await db.query(
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
        ) AS completed,

        GREATEST(
          COALESCE(SUM(documents_received), 0)
          -
          COALESCE(SUM(documents_completed), 0),
          0
        ) AS backlog

      FROM daily_entries

      GROUP BY
        DATE_FORMAT(production_date, '%Y-%m'),
        DATE_FORMAT(production_date, '%b %Y')

      ORDER BY month_key ASC
      `
    );

    // Returns monthly Analytics data.
    return res.status(200).json({
      success: true,
      count: monthly.length,
      monthly,
    });
  } catch (error) {
    // Logs monthly Analytics errors in the backend terminal.
    console.error("Monthly Analytics Error:", error);

    // Returns an error when monthly Analytics cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load monthly analytics",
      error: error.message,
    });
  }
};


// Gets production comparison for every project.
const getProjectComparison = async (req, res) => {
  try {
    // Calculates received, completed, backlog, and completion rate by project.
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
          COALESCE(SUM(de.documents_received), 0)
          -
          COALESCE(SUM(de.documents_completed), 0),
          0
        ) AS backlog,

        CASE
          WHEN COALESCE(
            SUM(de.documents_received),
            0
          ) > 0

          THEN ROUND(
            (
              COALESCE(
                SUM(de.documents_completed),
                0
              )
              /
              COALESCE(
                SUM(de.documents_received),
                0
              )
            ) * 100
          )

          ELSE 0
        END AS completion_rate

      FROM projects p

      LEFT JOIN daily_entries de
        ON de.project_id = p.id

      GROUP BY
        p.id,
        p.project_code,
        p.project_name

      ORDER BY completed DESC
      `
    );

    // Returns project-wise Analytics comparison.
    return res.status(200).json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error) {
    // Logs project comparison errors in the backend terminal.
    console.error("Project Comparison Error:", error);

    // Returns an error when project comparison cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load project comparison",
      error: error.message,
    });
  }
};


// Gets the highest-producing active Indexers.
const getTopPerformers = async (req, res) => {
  try {
    // Calculates total completed production for each active Indexer.
    const [performers] = await db.query(
      `
      SELECT
        u.id,
        u.employee_id,
        u.name,

        COALESCE(
          SUM(de.documents_completed),
          0
        ) AS completed,

        COUNT(
          DISTINCT DATE(de.production_date)
        ) AS production_days

      FROM users u

      LEFT JOIN daily_entries de
        ON de.user_id = u.id

      WHERE u.role = 'indexer'
        AND u.status = 'active'

      GROUP BY
        u.id,
        u.employee_id,
        u.name

      ORDER BY completed DESC

      LIMIT 5
      `
    );

    // Converts MySQL values and calculates average production for each performer.
    const formattedPerformers = performers.map(
      (performer) => {
        // Converts total completed production into a JavaScript number.
        const completed = Number(
          performer.completed
        );

        // Converts production-day count into a JavaScript number.
        const productionDays = Number(
          performer.production_days
        );

        // Returns the formatted performer with average daily productivity.
        return {
          id: performer.id,
          employee_id: performer.employee_id,
          name: performer.name,
          completed,
          productionDays,

          averageDailyProductivity:
            productionDays > 0
              ? Math.round(
                  completed / productionDays
                )
              : 0,
        };
      }
    );

    // Returns the top-performing Indexers.
    return res.status(200).json({
      success: true,
      count: formattedPerformers.length,
      performers: formattedPerformers,
    });
  } catch (error) {
    // Logs top performer errors in the backend terminal.
    console.error("Top Performers Error:", error);

    // Returns an error when top performers cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load top performers",
      error: error.message,
    });
  }
};

// Gets daily completed production compared with the configured production target.
const getCompletedVsTarget = async (req, res) => {
  try {
    // Combines actual completed production and configured targets for each date.
    const [trend] = await db.query(
      `
      SELECT
        dates.production_date,

        COALESCE(actual.completed, 0) AS completed,

        COALESCE(targets.target, 0) AS target

      FROM
      (
        SELECT production_date
        FROM daily_entries

        UNION

        SELECT target_date AS production_date
        FROM production_targets
      ) dates

      LEFT JOIN
      (
        SELECT
          production_date,
          SUM(documents_completed) AS completed
        FROM daily_entries
        GROUP BY production_date
      ) actual
        ON actual.production_date = dates.production_date

      LEFT JOIN
      (
        SELECT
          target_date,
          SUM(target_count) AS target
        FROM production_targets
        GROUP BY target_date
      ) targets
        ON targets.target_date = dates.production_date

      ORDER BY dates.production_date ASC
      `
    );

    // Converts MySQL numeric values into normal JavaScript numbers.
    const formattedTrend = trend.map((item) => ({
      production_date: item.production_date,
      completed: Number(item.completed),
      target: Number(item.target),
    }));

    // Returns Completed vs Target trend data for Core Team Analytics.
    return res.status(200).json({
      success: true,
      count: formattedTrend.length,
      trend: formattedTrend,
    });
  } catch (error) {
    // Logs Completed vs Target errors in the backend terminal.
    console.error("Completed Vs Target Error:", error);

    // Returns an error when Completed vs Target data cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load completed vs target",
      error: error.message,
    });
  }
};

// Gets organisation-wide completed, pending, and in-review production distribution.
const getStatusDistribution = async (req, res) => {
  try {
    // Calculates completed and pending production from all daily entries.
    const [rows] = await db.query(
      `
      SELECT
        COALESCE(SUM(documents_received), 0) AS received,
        COALESCE(SUM(documents_completed), 0) AS completed
      FROM daily_entries
      `
    );

    // Converts received production into a JavaScript number.
    const received = Number(rows[0].received);

    // Converts completed production into a JavaScript number.
    const completed = Number(rows[0].completed);

    // Calculates pending production from received minus completed.
    const pending = Math.max(
      received - completed,
      0
    );

    // Counts submitted entries that are currently waiting for review.
    const [reviewRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(documents_completed), 0) AS inReview
      FROM daily_entries
      WHERE status = 'SUBMITTED'
      `
    );

    // Converts in-review production into a JavaScript number.
    const inReview = Number(
      reviewRows[0].inReview
    );

    // Calculates completed percentage for the distribution chart.
    const completionRate =
      received > 0
        ? Math.round(
            (completed / received) * 100
          )
        : 0;

    // Returns production status distribution for Core Team Analytics.
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
    // Logs status distribution errors in the backend terminal.
    console.error(
      "Status Distribution Error:",
      error
    );

    // Returns an error when status distribution cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load status distribution",
      error: error.message,
    });
  }
};


// Exports all Core Team Analytics functions so the routes can use them.
module.exports = {
  getAnalyticsSummary,
  getMonthlyAnalytics,
  getProjectComparison,
  getTopPerformers,
  getCompletedVsTarget,
  getStatusDistribution,
};