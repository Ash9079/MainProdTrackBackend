const db = require("../config/db");

const calculateProductivity = ({
  received,
  completed,
}) => {
  const totalReceived =
    Number(received || 0);

  const totalCompleted =
    Number(completed || 0);

  return totalReceived > 0
    ? Math.round(
        (totalCompleted / totalReceived) *
          100
      )
    : 0;
};

const getMyReportSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const period =
      req.query.period === "month"
        ? "month"
        : "week";

    const rawProjectId = req.query.projectId;
    const rawEmployeeId = req.query.employeeId;

    const projectId =
      rawProjectId && rawProjectId !== "all"
        ? Number(rawProjectId)
        : null;

    const employeeId =
      rawEmployeeId && rawEmployeeId !== "all"
        ? Number(rawEmployeeId)
        : null;

    if (
      projectId !== null &&
      (!Number.isInteger(projectId) || projectId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    if (
      employeeId !== null &&
      (!Number.isInteger(employeeId) || employeeId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const dateCondition =
      getProductionDateCondition(period);

    let rows;

    // INDEXER
    if (role === "indexer") {
      const conditions = [
        "de.user_id = ?",
        dateCondition,
      ];

      const queryValues = [userId];

      if (projectId !== null) {
        conditions.push("de.project_id = ?");
        queryValues.push(projectId);
      }

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

        WHERE ${conditions.join(" AND ")}
        `,
        queryValues
      );
    }

    // TEAM LEAD
    else if (role === "teamLead") {
      const conditions = [
        "u.team_lead_id = ?",
        "u.status = 'active'",
        dateCondition,
      ];

      const queryValues = [userId];

      if (projectId !== null) {
        conditions.push("de.project_id = ?");
        queryValues.push(projectId);
      }

      if (employeeId !== null) {
        conditions.push("u.user_id = ?");
        queryValues.push(employeeId);
      }

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

        FROM users u

        JOIN daily_entry de
          ON de.user_id = u.user_id

        WHERE ${conditions.join(" AND ")}
        `,
        queryValues
      );
    }

    // CORE TEAM AND ADMINISTRATOR
else if (
  role === "coreTeam" ||
  role === "administrator"
) {
  const conditions = [
    "u.status = 'active'",
    "r.code = 'indexer'",
    dateCondition,
  ];

  const queryValues = [];

  if (projectId !== null) {
    conditions.push("de.project_id = ?");
    queryValues.push(projectId);
  }

  if (employeeId !== null) {
    conditions.push("u.user_id = ?");
    queryValues.push(employeeId);
  }

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

    FROM users u

    JOIN role r
      ON r.role_id = u.role_id

    JOIN daily_entry de
      ON de.user_id = u.user_id

    WHERE ${conditions.join(" AND ")}
    `,
    queryValues
  );
}

    else {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to access this report",
      });
    }

    const totalReceived =
      Number(rows[0]?.totalReceived || 0);

    const totalCompleted =
      Number(rows[0]?.totalCompleted || 0);

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

    const rawProjectId = req.query.projectId;
    const rawEmployeeId = req.query.employeeId;

    const projectId =
      rawProjectId && rawProjectId !== "all"
        ? Number(rawProjectId)
        : null;

    const employeeId =
      rawEmployeeId && rawEmployeeId !== "all"
        ? Number(rawEmployeeId)
        : null;

    if (
      projectId !== null &&
      (!Number.isInteger(projectId) || projectId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    if (
      employeeId !== null &&
      (!Number.isInteger(employeeId) || employeeId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const dateCondition =
      getProductionDateCondition(period);

    let production;

    // INDEXER
    if (role === "indexer") {
      const conditions = [
        "de.user_id = ?",
        dateCondition,
      ];

      const queryValues = [userId];

      if (projectId !== null) {
        conditions.push("de.project_id = ?");
        queryValues.push(projectId);
      }

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

        FROM daily_entry de

        WHERE ${conditions.join(" AND ")}

        GROUP BY
          de.production_date,
          DAYNAME(de.production_date)

        ORDER BY de.production_date ASC
        `,
        queryValues
      );
    }

    // TEAM LEAD
    else if (role === "teamLead") {
      const conditions = [
        "u.team_lead_id = ?",
        "u.status = 'active'",
        dateCondition,
      ];

      const queryValues = [userId];

      if (projectId !== null) {
        conditions.push("de.project_id = ?");
        queryValues.push(projectId);
      }

      if (employeeId !== null) {
        conditions.push("u.user_id = ?");
        queryValues.push(employeeId);
      }

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

        WHERE ${conditions.join(" AND ")}

        GROUP BY
          de.production_date,
          DAYNAME(de.production_date)

        ORDER BY de.production_date ASC
        `,
        queryValues
      );
    }

    // CORE TEAM AND ADMINISTRATOR
else if (
  role === "coreTeam" ||
  role === "administrator"
) {
  const conditions = [
    "u.status = 'active'",
    "r.code = 'indexer'",
    dateCondition,
  ];

  const queryValues = [];

  if (projectId !== null) {
    conditions.push("de.project_id = ?");
    queryValues.push(projectId);
  }

  if (employeeId !== null) {
    conditions.push("u.user_id = ?");
    queryValues.push(employeeId);
  }

  [production] = await db.query(
    `
    SELECT
      DATE_FORMAT(
        de.production_date,
        '%Y-%m-%d'
      ) AS production_date,

      DAYNAME(
        de.production_date
      ) AS day_name,

      COALESCE(
        SUM(de.docs_received),
        0
      ) AS received,

      COALESCE(
        SUM(de.docs_completed),
        0
      ) AS completed

    FROM users u

    JOIN role r
      ON r.role_id = u.role_id

    JOIN daily_entry de
      ON de.user_id = u.user_id

    WHERE ${conditions.join(" AND ")}

    GROUP BY
      de.production_date,
      DAYNAME(de.production_date)

    ORDER BY de.production_date ASC
    `,
    queryValues
  );
}

    else {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to access this report",
      });
    }

    return res.status(200).json({
      success: true,
      count: production.length,
      production,
    });
  } catch (error) {
    console.error(
      "Daily Production Report Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load daily production report",
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

    const rawProjectId = req.query.projectId;
    const rawEmployeeId = req.query.employeeId;

    const projectId =
      rawProjectId && rawProjectId !== "all"
        ? Number(rawProjectId)
        : null;

    const employeeId =
      rawEmployeeId && rawEmployeeId !== "all"
        ? Number(rawEmployeeId)
        : null;

    if (
      projectId !== null &&
      (!Number.isInteger(projectId) || projectId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    if (
      employeeId !== null &&
      (!Number.isInteger(employeeId) || employeeId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const dateCondition =
      getProductionDateCondition(period);

      let userCondition;
      let userConditionValues = [];

      if (role === "indexer") {
        userCondition = "u.user_id = ?";
        userConditionValues = [userId];
      }

      else if (role === "teamLead") {
        userCondition = `
          u.team_lead_id = ?
          AND u.status = 'active'
        `;

        userConditionValues = [userId];
      }

      else if (
        role === "coreTeam" ||
        role === "administrator"
      ) {
        userCondition = `
          u.status = 'active'
          AND u.role_id = (
            SELECT role_id
            FROM role
            WHERE code = 'indexer'
            LIMIT 1
          )
        `;

        userConditionValues = [];
      }

      else {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to access this report",
        });
      }

    let projectListCondition = "";
    let productionProjectCondition = "";
    let employeeCondition = "";
    let assignedProjectCondition = "";

    const queryValues = [];

    // First placeholder: project list subquery
    if (projectId !== null) {
      projectListCondition =
        "WHERE pa.project_id = ?";

      queryValues.push(projectId);
    }

    // Second placeholder: production subquery
    if (projectId !== null) {
      productionProjectCondition =
        "AND de.project_id = ?";

      queryValues.push(projectId);
    }

    // Values required by the role condition
      queryValues.push(...userConditionValues);

    // Selected employee
    if (employeeId !== null) {
      employeeCondition = "AND u.user_id = ?";
      queryValues.push(employeeId);
    }

    // Show only employees assigned to selected project
    if (projectId !== null) {
      assignedProjectCondition = `
        AND EXISTS (
          SELECT 1
          FROM project_assignment pa_filter
          WHERE pa_filter.user_id = u.user_id
            AND pa_filter.project_id = ?
        )
      `;

      queryValues.push(projectId);
    }

    const [employees] = await db.query(
      `
      SELECT
        u.user_id AS id,
        u.emp_code,
        u.full_name AS employee_name,

        COALESCE(
          projects.project_names,
          '—'
        ) AS projects,

        COALESCE(
          production.received,
          0
        ) AS received,

        COALESCE(
          production.completed,
          0
        ) AS completed,

        GREATEST(
          COALESCE(production.received, 0) -
          COALESCE(production.completed, 0),
          0
        ) AS pending,

        CASE
          WHEN COALESCE(
            production.received,
            0
          ) > 0
          THEN ROUND(
            (
              COALESCE(
                production.completed,
                0
              ) /
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

        ${projectListCondition}

        GROUP BY pa.user_id
      ) projects
        ON projects.user_id = u.user_id

      LEFT JOIN (
        SELECT
          de.user_id,

          SUM(
            de.docs_received
          ) AS received,

          SUM(
            de.docs_completed
          ) AS completed

        FROM daily_entry de

        WHERE ${dateCondition}
          ${productionProjectCondition}

        GROUP BY de.user_id
      ) production
        ON production.user_id = u.user_id

      WHERE ${userCondition}
        ${employeeCondition}
        ${assignedProjectCondition}

      ORDER BY u.full_name ASC
      `,
      queryValues
    );

    const employeesWithProductivity =
      employees.map((employee) => ({
        ...employee,
        productivity:
          calculateProductivity({
            received: employee.received,
            completed: employee.completed,
          }),
      }));

    return res.status(200).json({
      success: true,
      count:
        employeesWithProductivity.length,
      employees:
        employeesWithProductivity,
    });
  } catch (error) {
    console.error(
      "Employee Production Report Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load employee production report",
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