const db = require("../config/db");
const bcrypt = require("bcryptjs");


// ============================================================
// HELPER - GENERATE NEXT EMPLOYEE CODE
// ============================================================

const generateEmployeeCode = async (connection) => {
  const [rows] = await connection.query(`
    SELECT emp_code
    FROM users
    WHERE emp_code REGEXP '^EMP-[0-9]+$'
    ORDER BY CAST(
      SUBSTRING(emp_code, 5) AS UNSIGNED
    ) DESC
    LIMIT 1
  `);

  if (rows.length === 0) {
    return "EMP-0001";
  }

  const lastNumber = Number(
    rows[0].emp_code.replace("EMP-", "")
  );

  return `EMP-${String(lastNumber + 1).padStart(4, "0")}`;
};


// ============================================================
// 1. GET ALL USERS
// ============================================================

const getAllUsers = async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT
        u.user_id AS id,
        u.emp_code AS employee_id,
        u.full_name AS name,
        u.username,
        u.email,

        u.department_id,
        d.name AS department,

        u.designation,

        u.role_id,
        r.code AS role,

        u.team_lead_id,
        tl.full_name AS team_lead_name,

        u.status,
        u.last_login_at,
        u.created_at,

        GROUP_CONCAT(
          DISTINCT p.project_name
          ORDER BY p.project_name
          SEPARATOR ', '
        ) AS projects,

        GROUP_CONCAT(
          DISTINCT p.project_id
          ORDER BY p.project_id
          SEPARATOR ','
        ) AS project_ids

      FROM users u

      INNER JOIN role r
        ON r.role_id = u.role_id

      LEFT JOIN department d
        ON d.department_id = u.department_id

      LEFT JOIN users tl
        ON tl.user_id = u.team_lead_id

      LEFT JOIN project_assignment pa
        ON pa.user_id = u.user_id

      LEFT JOIN project p
        ON p.project_id = pa.project_id

      GROUP BY
        u.user_id,
        u.emp_code,
        u.full_name,
        u.username,
        u.email,
        u.department_id,
        d.name,
        u.designation,
        u.role_id,
        r.code,
        u.team_lead_id,
        tl.full_name,
        u.status,
        u.last_login_at,
        u.created_at

      ORDER BY u.full_name ASC
    `);

    const formattedUsers = users.map((user) => ({
      id: user.id,
      employee_id: user.employee_id,
      name: user.name,
      username: user.username,
      email: user.email,

      department_id: user.department_id,
      department: user.department,

      designation: user.designation,

      role_id: user.role_id,
      role: user.role,

      team_lead_id: user.team_lead_id,
      team_lead_name: user.team_lead_name,

      status: user.status,
      last_login_at: user.last_login_at,
      created_at: user.created_at,

      projects: user.projects
        ? user.projects.split(", ")
        : [],

      project_ids: user.project_ids
        ? user.project_ids
            .split(",")
            .map(Number)
        : [],
    }));

    return res.status(200).json({
      success: true,
      count: formattedUsers.length,
      users: formattedUsers,
    });

  } catch (error) {
    console.error("Get Users Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load users",
      error: error.message,
    });
  }
};


// ============================================================
// 2. GET TEAM LEADS
// ============================================================

const getUserTeamLeads = async (req, res) => {
  try {
    const [teamLeads] = await db.query(`
      SELECT
        u.user_id AS id,
        u.emp_code AS employee_id,
        u.full_name AS name,
        u.email

      FROM users u

      INNER JOIN role r
        ON r.role_id = u.role_id

      WHERE r.code = 'lead'
        AND u.status = 'active'

      ORDER BY u.full_name ASC
    `);

    return res.status(200).json({
      success: true,
      count: teamLeads.length,
      teamLeads,
    });

  } catch (error) {
    console.error(
      "Get User Team Leads Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load Team Leads",
      error: error.message,
    });
  }
};


// ============================================================
// 3. GET PROJECTS FOR DROPDOWN
// ============================================================

const getUserProjects = async (req, res) => {
  try {
    const [projects] = await db.query(`
      SELECT
        project_id AS id,
        project_code,
        project_name

      FROM project

      WHERE status = 'active'

      ORDER BY project_name ASC
    `);

    return res.status(200).json({
      success: true,
      count: projects.length,
      projects,
    });

  } catch (error) {
    console.error(
      "Get User Projects Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load projects",
      error: error.message,
    });
  }
};


// ============================================================
// 4. CREATE USER
// ============================================================

const createUser = async (req, res) => {
  let connection;

  try {
    const {
      name,
      username,
      email,
      password,
      roleId,
      departmentId,
      designation,
      teamLeadId,
      projectIds = [],
      status = "active",
    } = req.body;


    // --------------------------------------------------------
    // Required fields
    // --------------------------------------------------------

    if (
      !name ||
      !username ||
      !email ||
      !password ||
      !roleId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, username, email, password and role are required",
      });
    }


    if (
      !["active", "inactive"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user status",
      });
    }


    // --------------------------------------------------------
    // Validate role
    // --------------------------------------------------------

    const [roleRows] = await db.query(
      `
      SELECT role_id, code
      FROM role
      WHERE role_id = ?
      LIMIT 1
      `,
      [roleId]
    );

    if (roleRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }


    // --------------------------------------------------------
    // Check duplicate username/email
    // --------------------------------------------------------

    const [existingUsers] = await db.query(
      `
      SELECT user_id
      FROM users
      WHERE email = ?
         OR username = ?
      LIMIT 1
      `,
      [email, username]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Email or username already exists",
      });
    }


    // --------------------------------------------------------
    // Validate Team Lead
    // --------------------------------------------------------

    if (teamLeadId) {
      const [teamLeadRows] = await db.query(
        `
        SELECT u.user_id

        FROM users u

        INNER JOIN role r
          ON r.role_id = u.role_id

        WHERE u.user_id = ?
          AND r.code = 'lead'
          AND u.status = 'active'

        LIMIT 1
        `,
        [teamLeadId]
      );

      if (teamLeadRows.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Selected Team Lead is invalid",
        });
      }
    }


    // --------------------------------------------------------
    // Validate projects
    // --------------------------------------------------------

    const uniqueProjectIds = [
      ...new Set(
        (Array.isArray(projectIds)
          ? projectIds
          : []
        ).map(Number)
      ),
    ].filter(Number.isInteger);


    if (uniqueProjectIds.length > 0) {
      const placeholders =
        uniqueProjectIds
          .map(() => "?")
          .join(",");

      const [validProjects] =
        await db.query(
          `
          SELECT project_id
          FROM project
          WHERE project_id IN (${placeholders})
          `,
          uniqueProjectIds
        );

      if (
        validProjects.length !==
        uniqueProjectIds.length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "One or more selected projects are invalid",
        });
      }
    }


    // --------------------------------------------------------
    // Start transaction
    // --------------------------------------------------------

    connection = await db.getConnection();

    await connection.beginTransaction();


    const employeeCode =
      await generateEmployeeCode(connection);


    const passwordHash =
      await bcrypt.hash(password, 10);


    // --------------------------------------------------------
    // Insert user
    // --------------------------------------------------------

    const [result] =
      await connection.query(
        `
        INSERT INTO users
        (
          emp_code,
          full_name,
          username,
          email,
          password_hash,
          auth_method,
          department_id,
          designation,
          role_id,
          team_lead_id,
          status
        )

        VALUES
        (?, ?, ?, ?, ?, 'password', ?, ?, ?, ?, ?)
        `,
        [
          employeeCode,
          name,
          username,
          email,
          passwordHash,
          departmentId || null,
          designation || null,
          roleId,
          teamLeadId || null,
          status,
        ]
      );


    const userId = result.insertId;


    // --------------------------------------------------------
    // Assign projects
    // --------------------------------------------------------

    for (const projectId of uniqueProjectIds) {
      await connection.query(
        `
        INSERT INTO project_assignment
        (
          user_id,
          project_id,
          assigned_by
        )
        VALUES (?, ?, ?)
        `,
        [
          userId,
          projectId,
          req.user?.id || null,
        ]
      );
    }


    await connection.commit();


    return res.status(201).json({
      success: true,
      message: "User created successfully",

      user: {
        id: userId,
        employee_id: employeeCode,
        name,
        username,
        email,
      },
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Create User Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// ============================================================
// 5. UPDATE USER
// ============================================================

const updateUser = async (req, res) => {
  let connection;

  try {
    const userId = Number(req.params.id);

    const {
      name,
      username,
      email,
      password,
      roleId,
      departmentId,
      designation,
      teamLeadId,
      projectIds,
      status,
    } = req.body;


    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }


    // --------------------------------------------------------
    // Check user exists
    // --------------------------------------------------------

    const [existingUser] = await db.query(
      `
      SELECT user_id
      FROM users
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }


    // --------------------------------------------------------
    // Check duplicate username/email
    // --------------------------------------------------------

    if (email || username) {
      const [duplicateRows] =
        await db.query(
          `
          SELECT user_id

          FROM users

          WHERE user_id <> ?

            AND (
              (? IS NOT NULL AND email = ?)

              OR

              (? IS NOT NULL AND username = ?)
            )

          LIMIT 1
          `,
          [
            userId,
            email || null,
            email || null,
            username || null,
            username || null,
          ]
        );

      if (duplicateRows.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Email or username already exists",
        });
      }
    }


    // --------------------------------------------------------
    // Validate role
    // --------------------------------------------------------

    if (roleId !== undefined) {
      const [roleRows] = await db.query(
        `
        SELECT role_id
        FROM role
        WHERE role_id = ?
        LIMIT 1
        `,
        [roleId]
      );

      if (roleRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid role",
        });
      }
    }


    // --------------------------------------------------------
    // Validate Team Lead
    // --------------------------------------------------------

    if (
      teamLeadId !== undefined &&
      teamLeadId !== null
    ) {
      const [teamLeadRows] =
        await db.query(
          `
          SELECT u.user_id

          FROM users u

          INNER JOIN role r
            ON r.role_id = u.role_id

          WHERE u.user_id = ?
            AND r.code = 'lead'
            AND u.status = 'active'

          LIMIT 1
          `,
          [teamLeadId]
        );

      if (teamLeadRows.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Selected Team Lead is invalid",
        });
      }
    }


    // --------------------------------------------------------
    // Validate project IDs
    // --------------------------------------------------------

    let uniqueProjectIds = null;

    if (projectIds !== undefined) {
      if (!Array.isArray(projectIds)) {
        return res.status(400).json({
          success: false,
          message:
            "projectIds must be an array",
        });
      }

      uniqueProjectIds = [
        ...new Set(
          projectIds.map(Number)
        ),
      ].filter(Number.isInteger);


      if (uniqueProjectIds.length > 0) {
        const placeholders =
          uniqueProjectIds
            .map(() => "?")
            .join(",");

        const [validProjects] =
          await db.query(
            `
            SELECT project_id
            FROM project
            WHERE project_id IN (${placeholders})
            `,
            uniqueProjectIds
          );

        if (
          validProjects.length !==
          uniqueProjectIds.length
        ) {
          return res.status(400).json({
            success: false,
            message:
              "One or more selected projects are invalid",
          });
        }
      }
    }


    // --------------------------------------------------------
    // Build UPDATE dynamically
    // --------------------------------------------------------

    const fields = [];
    const values = [];


    if (name !== undefined) {
      fields.push("full_name = ?");
      values.push(name);
    }


    if (username !== undefined) {
      fields.push("username = ?");
      values.push(username);
    }


    if (email !== undefined) {
      fields.push("email = ?");
      values.push(email);
    }


    if (departmentId !== undefined) {
      fields.push("department_id = ?");
      values.push(departmentId || null);
    }


    if (designation !== undefined) {
      fields.push("designation = ?");
      values.push(designation || null);
    }


    if (roleId !== undefined) {
      fields.push("role_id = ?");
      values.push(roleId);
    }


    if (teamLeadId !== undefined) {
      fields.push("team_lead_id = ?");
      values.push(teamLeadId || null);
    }


    if (status !== undefined) {
      if (
        !["active", "inactive"].includes(status)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid user status",
        });
      }

      fields.push("status = ?");
      values.push(status);
    }


    if (password) {
      const passwordHash =
        await bcrypt.hash(password, 10);

      fields.push("password_hash = ?");
      values.push(passwordHash);

      fields.push("auth_method = ?");
      values.push("password");
    }


    // --------------------------------------------------------
    // Transaction
    // --------------------------------------------------------

    connection = await db.getConnection();

    await connection.beginTransaction();


    if (fields.length > 0) {
      values.push(userId);

      await connection.query(
        `
        UPDATE users
        SET ${fields.join(", ")}
        WHERE user_id = ?
        `,
        values
      );
    }


    // --------------------------------------------------------
    // Replace project assignments only when projectIds
    // was explicitly provided.
    // --------------------------------------------------------

    if (uniqueProjectIds !== null) {

      await connection.query(
        `
        DELETE FROM project_assignment
        WHERE user_id = ?
        `,
        [userId]
      );


      for (const projectId of uniqueProjectIds) {
        await connection.query(
          `
          INSERT INTO project_assignment
          (
            user_id,
            project_id,
            assigned_by
          )

          VALUES (?, ?, ?)
          `,
          [
            userId,
            projectId,
            req.user?.id || null,
          ]
        );
      }
    }


    await connection.commit();


    return res.status(200).json({
      success: true,
      message: "User updated successfully",
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Update User Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getAllUsers,
  getUserTeamLeads,
  getUserProjects,
  createUser,
  updateUser,
};