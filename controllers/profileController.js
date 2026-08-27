const db = require("../config/db");

// Gets profile details for the logged-in user
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const [users] = await db.query(
      `
      SELECT
        id,
        employee_id,
        name,
        email,
        role,
        department,
        status
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let projects = [];

    // Gets projects directly assigned to an Indexer
    if (role === "indexer") {
      [projects] = await db.query(
        `
        SELECT
          p.id,
          p.project_code,
          p.project_name,
          p.client_name,
          p.reporting_category,
          p.status

        FROM user_project_assignments upa

        JOIN projects p
          ON p.id = upa.project_id

        WHERE upa.user_id = ?

        ORDER BY p.project_name ASC
        `,
        [userId]
      );
    }

    // Gets projects handled by members of the Team Lead's team
    else if (role === "teamLead") {
      [projects] = await db.query(
        `
        SELECT DISTINCT
          p.id,
          p.project_code,
          p.project_name,
          p.client_name,
          p.reporting_category,
          p.status

        FROM team_members tm

        JOIN user_project_assignments upa
          ON upa.user_id = tm.member_id

        JOIN projects p
          ON p.id = upa.project_id

        WHERE tm.team_lead_id = ?

        ORDER BY p.project_name ASC
        `,
        [userId]
      );
    }

    return res.status(200).json({
      success: true,
      profile: users[0],
      assignedProjects: projects,
    });
  } catch (error) {
    console.error("Get Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load profile",
      error: error.message,
    });
  }
};

module.exports = {
  getMyProfile,
};