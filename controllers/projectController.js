const db = require("../config/db");

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

        COALESCE(
          SUM(de.docs_received - de.docs_completed),
          0
        ) AS total_pending,

        CASE
          WHEN COALESCE(SUM(de.docs_received), 0) > 0
          THEN ROUND(
            (
              SUM(de.docs_received - de.docs_completed)
              / SUM(de.docs_received)
            ) * 100,
            0
          )
          ELSE 0
        END AS backlog_percentage

      FROM v_user_visible_project vup

      JOIN project p
        ON p.project_id = vup.project_id

      LEFT JOIN reporting_category rc
        ON rc.category_id = p.category_id

      LEFT JOIN project_assignment pa
        ON pa.user_id = vup.user_id
       AND pa.project_id = vup.project_id

      LEFT JOIN daily_entry de
        ON de.project_id = p.project_id
       AND de.user_id = vup.user_id

      WHERE vup.user_id = ?

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
      [userId]
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