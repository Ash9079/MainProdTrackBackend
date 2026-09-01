const db = require("../config/db");

const getMyReportSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const period =
      req.query.period === "month"
        ? "month"
        : "week";

    const dateCondition =
      getProductionDateCondition(period);

    let rows;

    // =========================
    // INDEXER REPORT
    // =========================
      if (role === "indexer") {
        [rows] = await db.query(
          `
          SELECT
            COALESCE(
              SUM(de.docs_received),
              0
            ) AS totalReceived,

            COALESCE(
              SUM(de.docs_completed),
              0
            ) AS totalCompleted

          FROM daily_entry de

          WHERE de.user_id = ?
            AND ${dateCondition}
          `,
          [userId]
        );
      }

    // =========================
    // TEAM LEAD REPORT
    // =========================
    else if (role === "teamLead") {
      [rows] = await db.query(
        `
        SELECT
          COALESCE(SUM(de.docs_received), 0) AS totalReceived,
          COALESCE(SUM(de.docs_completed), 0) AS totalCompleted

        FROM users u

        LEFT JOIN daily_entry de
        ON de.user_id = u.user_id
        AND ${dateCondition}

        WHERE u.team_lead_id = ?
        AND u.status = 'active'
        `,
        [userId]
      );
    }

    // =========================
    // UNSUPPORTED ROLE
    // =========================
    else {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this report",
      });
    }

    const totalReceived = Number(rows[0].totalReceived);
    const totalCompleted = Number(rows[0].totalCompleted);

    const totalPending = Math.max(
      totalReceived - totalCompleted,
      0
    );

    const completionRate =
      totalReceived > 0
        ? Math.round(
            (totalCompleted / totalReceived) * 100
          )
        : 0;

    return res.status(200).json({
      success: true,

      summary: {
        totalReceived,
        totalCompleted,
        totalPending,
        completionRate,
      },
    });

  } catch (error) {
    console.error("Report Summary Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load report summary",
      error: error.message,
    });
  }
};


// ======================================================
// DAILY PRODUCTION REPORT
//
// Indexer:
//   Groups logged-in Indexer's production by date.
//
// Team Lead:
//   Groups production of the entire team by date.
// ======================================================

const getMyDailyProduction = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;


    const period =
      req.query.period === "month"
        ? "month"
        : "week";

    const dateCondition =
      getProductionDateCondition(period);

    let production;

    // =========================
    // INDEXER
    // =========================
    if (role === "indexer") {
        [production] = await db.query(
          `
          SELECT
            DATE_FORMAT(
              de.production_date,
              '%Y-%m-%d'
            ) AS production_date,

            DAYNAME(de.production_date) AS day_name,

            COALESCE(
              SUM(de.docs_received),
              0
            ) AS received,

            COALESCE(
              SUM(de.docs_completed),
              0
            ) AS completed

          FROM users u

          JOIN daily_entry de
            ON de.user_id = u.user_id

          WHERE u.team_lead_id = ?
            AND u.status = 'active'

          GROUP BY
            de.production_date,
            DAYNAME(de.production_date)

          ORDER BY de.production_date ASC
          `,
          [userId]
        );
    }

    // =========================
    // TEAM LEAD
    // =========================
      else if (role === "teamLead") {
        [production] = await db.query(
          `
          SELECT
            DATE_FORMAT(
              de.production_date,
              '%Y-%m-%d'
            ) AS production_date,

            DAYNAME(de.production_date) AS day_name,

            COALESCE(SUM(de.docs_received), 0) AS received,
            COALESCE(SUM(de.docs_completed), 0) AS completed

          FROM users u

          JOIN daily_entry de
            ON de.user_id = u.user_id

          WHERE u.team_lead_id = ?
            AND u.status = 'active'

          GROUP BY
            de.production_date,
            DAYNAME(de.production_date)

          ORDER BY de.production_date ASC
          `,
          [userId]
        );
      }

    // =========================
    // UNSUPPORTED ROLE
    // =========================
    else {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this report",
      });
    }

    return res.status(200).json({
      success: true,
      count: production.length,
      production,
    });

  } catch (error) {
    console.error("Daily Production Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load daily production report",
      error: error.message,
    });
  }
};


const getEmployeeProduction = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const period =
      req.query.period === "month"
        ? "month"
        : "week";

    const dateCondition =
      getProductionDateCondition(period);

    let userCondition;
    let queryValues;

    if (role === "indexer") {
      userCondition = "u.user_id = ?";
      queryValues = [userId];
    } else if (role === "teamLead") {
      userCondition =
        "u.team_lead_id = ? AND u.status = 'active'";
      queryValues = [userId];
    } else {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this report",
      });
    }

    const [employees] = await db.query(
      `
      SELECT
        u.user_id AS id,
        u.emp_code,
        u.full_name AS employee_name,

        COALESCE(projects.project_names, '—') AS projects,

        COALESCE(production.received, 0) AS received,
        COALESCE(production.completed, 0) AS completed,

        GREATEST(
          COALESCE(production.received, 0) -
          COALESCE(production.completed, 0),
          0
        ) AS pending,

        CASE
          WHEN COALESCE(production.received, 0) > 0
          THEN ROUND(
            (
              COALESCE(production.completed, 0) /
              production.received
            ) * 100
          )
          ELSE 0
        END AS productivity

      FROM users u

      LEFT JOIN (
        SELECT
          pa.user_id,
          GROUP_CONCAT(
            DISTINCT p.project_name
            ORDER BY p.project_name
            SEPARATOR ', '
          ) AS project_names
        FROM project_assignment pa
        JOIN project p
          ON p.project_id = pa.project_id
        GROUP BY pa.user_id
      ) projects
        ON projects.user_id = u.user_id

      LEFT JOIN (
        SELECT
          de.user_id,
          SUM(de.docs_received) AS received,
          SUM(de.docs_completed) AS completed
      FROM daily_entry de
      WHERE ${dateCondition}
      GROUP BY de.user_id
      ) production
        ON production.user_id = u.user_id

      WHERE ${userCondition}

      ORDER BY u.full_name ASC
      `,
      queryValues
    );

    return res.status(200).json({
      success: true,
      count: employees.length,
      employees,
    });
  } catch (error) {
    console.error("Employee Production Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load employee production report",
      error: error.message,
    });
  }
};

const getProductionDateCondition = (
  period,
  alias = "de"
) => {
  if (period === "month") {
    return `
      ${alias}.production_date >=
        DATE_FORMAT(CURDATE(), '%Y-%m-01')
      AND ${alias}.production_date <
        DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)
    `;
  }

  return `
    ${alias}.production_date >=
      DATE_SUB(
        CURDATE(),
        INTERVAL WEEKDAY(CURDATE()) DAY
      )
    AND ${alias}.production_date <
      DATE_ADD(
        DATE_SUB(
          CURDATE(),
          INTERVAL WEEKDAY(CURDATE()) DAY
        ),
        INTERVAL 7 DAY
      )
  `;
};

module.exports = {
  getMyReportSummary,
  getMyDailyProduction,
  getEmployeeProduction,
};