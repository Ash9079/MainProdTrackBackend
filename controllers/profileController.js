const db = require("../config/db");
const bcrypt = require("bcryptjs");

const {
  sendPasswordEmail,
} = require("../utils/mailer");
// Gets profile details for the logged-in user
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const [users] = await db.query(
      `
      SELECT
        u.user_id AS id,
        u.user_id,

        u.emp_code AS emp,
        u.emp_code AS employeeId,

        u.full_name AS name,
        u.full_name,

        u.username,
        u.email,

        d.name AS department,
        d.name AS dept,

        u.designation,

        r.name AS role,
        r.code AS role_code,

        CASE r.code
          WHEN 'indexer' THEN 'indexer'
          WHEN 'lead' THEN 'teamLead'
          WHEN 'core' THEN 'coreTeam'
          WHEN 'admin' THEN 'administrator'
          ELSE r.code
        END AS roleKey,

        team_lead_user.full_name AS team_lead,

        u.status,
        u.last_login_at,
        u.created_at

      FROM users u

      JOIN role r
        ON r.role_id = u.role_id

      LEFT JOIN department d
        ON d.department_id = u.department_id

      LEFT JOIN users team_lead_user
      ON team_lead_user.user_id = u.team_lead_id

      WHERE u.user_id = ?

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
        p.project_id AS id,
        p.project_id,
        p.project_code,
        p.project_name,
        p.client_name,

        rc.name AS reporting_category,

        p.status,
        p.start_date,
        p.end_date

      FROM project_assignment pa

      JOIN project p
        ON p.project_id = pa.project_id

      LEFT JOIN reporting_category rc
        ON rc.category_id = p.category_id

      WHERE pa.user_id = ?

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
          p.project_id AS id,
          p.project_id,
          p.project_code,
          p.project_name,
          p.client_name,

          rc.name AS reporting_category,

          p.status,
          p.start_date,
          p.end_date

        FROM project_assignment pa

        JOIN users member
          ON member.user_id = pa.user_id

        JOIN project p
          ON p.project_id = pa.project_id

        LEFT JOIN reporting_category rc
          ON rc.category_id = p.category_id

        WHERE
          pa.user_id = ?
          OR member.team_lead_id = ?

        ORDER BY p.project_name ASC
        `,
        [userId, userId]
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

// Changes password for the logged-in user
const changeMyPassword = async (
  req,
  res
) => {
  let connection;

  try {
    const userId = req.user.id;

    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Current password, new password and confirm password are required",
      });
    }

    if (
      String(newPassword).length < 8
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New password must contain at least 8 characters",
      });
    }

    if (
      String(newPassword).length > 72
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New password cannot exceed 72 characters",
      });
    }

    if (
      newPassword !== confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New password and confirm password do not match",
      });
    }

    if (
      currentPassword === newPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from the current password",
      });
    }

    const [users] = await db.query(
      `
      SELECT
        user_id,
        full_name,
        email,
        password_hash,
        status
      FROM users
      WHERE user_id = ?
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

    const user = users[0];

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message:
          "Your account is inactive",
      });
    }

    const passwordMatches =
      await bcrypt.compare(
        currentPassword,
        user.password_hash
      );

    if (!passwordMatches) {
      return res.status(400).json({
        success: false,
        message:
          "Current password is incorrect",
      });
    }

    const newPasswordHash =
      await bcrypt.hash(
        newPassword,
        10
      );

    connection =
      await db.getConnection();

    await connection.beginTransaction();

    await connection.query(
      `
      UPDATE users
      SET password_hash = ?
      WHERE user_id = ?
      `,
      [
        newPasswordHash,
        userId,
      ]
    );

    // Actual new password email par send hoga
    await sendPasswordEmail({
      name: user.full_name,
      email: user.email,
      password: newPassword,
      subject:
        "Your ProdTrack password was changed",
    });

    await connection.commit();

    return res.status(200).json({
      success: true,
      message:
        "Password changed successfully. The new password was sent to your email.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(
      "Change Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to change password",
      error: error.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  getMyProfile,
  changeMyPassword,
};