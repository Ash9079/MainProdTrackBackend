const db = require("../config/db");
const { SEES_ALL_PROJECTS_SQL } = require("../utils/roleSql");

const getMyProjects = async (req, res) => {
  try {
    const userId = req.user.id;

    const [projects] = await db.query(
      `
      SELECT
        p.project_id AS id,
        p.project_id,
        p.project_code,
        p.project_name,
        p.client_name,
        rc.name AS reporting_category,
        p.status,
        p.start_date,
        p.end_date,
        pa.assigned_at,

        COALESCE(SUM(de.docs_received), 0) AS total_received,
        COALESCE(SUM(de.docs_completed), 0) AS total_completed,

        -- Prevents unsigned subtraction errors when completed is greater than received.
          COALESCE(
            SUM(
              GREATEST(
                CAST(de.docs_received AS SIGNED) - CAST(de.docs_completed AS SIGNED),
                0
              )
            ),
            0
          ) AS total_pending,

       -- Calculates backlog safely without unsigned subtraction errors.
CASE
  WHEN COALESCE(SUM(de.docs_received), 0) > 0
  THEN ROUND(
    (
      SUM(
        GREATEST(
          CAST(de.docs_received AS SIGNED) - CAST(de.docs_completed AS SIGNED),
          0
        )
      )
      / SUM(de.docs_received)
    ) * 100,
    0
  )
  ELSE 0
END AS backlog_percentage

      FROM project p

      LEFT JOIN reporting_category rc
        ON rc.category_id = p.category_id

      LEFT JOIN project_assignment pa
        ON pa.user_id = ?
       AND pa.project_id = p.project_id

      LEFT JOIN daily_entry de
        ON de.project_id = p.project_id
       AND de.user_id = ?

      WHERE
        EXISTS (
          SELECT 1
          FROM users u
          INNER JOIN role r
            ON r.role_id = u.role_id
          WHERE u.user_id = ?
            AND ${SEES_ALL_PROJECTS_SQL}
        )
        OR EXISTS (
          SELECT 1
          FROM project_assignment assigned
          WHERE assigned.user_id = ?
            AND assigned.project_id = p.project_id
        )
        OR EXISTS (
          SELECT 1
          FROM users teammate
          INNER JOIN project_assignment assigned
            ON assigned.user_id = teammate.user_id
          WHERE teammate.team_lead_id = ?
            AND assigned.project_id = p.project_id
        )

      GROUP BY
        p.project_id,
        p.project_code,
        p.project_name,
        p.client_name,
        rc.name,
        p.status,
        p.start_date,
        p.end_date,
        pa.assigned_at

      ORDER BY p.project_name ASC
      `,
      [userId, userId, userId, userId, userId]
    );

    return res.status(200).json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error) {
    console.error("Get Projects Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load assigned projects",
      error: error.message,
    });
  }
};

module.exports = {
  getMyProjects,
};