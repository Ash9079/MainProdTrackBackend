const db = require("../config/db");

const getMyProjects = async (req, res) => {
  try {
    const userId = req.user.id;

    const [projects] = await db.query(
      `
      SELECT
        p.id,
        p.project_code,
        p.project_name,
        p.client_name,
        p.reporting_category,
        p.status,
        upa.assigned_at
      FROM user_project_assignments upa

      JOIN projects p
        ON p.id = upa.project_id

      WHERE upa.user_id = ?

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