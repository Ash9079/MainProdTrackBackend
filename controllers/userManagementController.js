// Imports bcrypt so generated passwords are securely hashed before storage.
const bcrypt = require("bcryptjs");

// Imports Node's crypto module for generating a temporary password.
const crypto = require("crypto");

// Imports the MySQL database connection.
const db = require("../config/db");


// Generates the next employee ID such as EMP-1051.
const generateEmployeeId = async (connection) => {
  // Finds the highest numeric employee ID currently stored.
  const [rows] = await connection.query(
    `
    SELECT
      MAX(
        CAST(
          SUBSTRING(employee_id, 5)
          AS UNSIGNED
        )
      ) AS highest_employee_number
    FROM users
    WHERE employee_id LIKE 'EMP-%'
    `
  );

  // Uses the next number after the current highest employee number.
  const nextNumber =
    Number(rows[0].highest_employee_number || 1000) + 1;

  // Formats the generated ID in EMP-XXXX format.
  return `EMP-${String(nextNumber).padStart(4, "0")}`;
};


// Generates a temporary password for a newly created employee.
const generateTemporaryPassword = () => {
  // Creates a short random password that can be changed after first login.
  return `Temp@${crypto.randomBytes(4).toString("hex")}`;
};


// Gets all employees for the Core Team Users screen.
const getAllUsers = async (req, res) => {
  try {
    // Loads employee details, Team Lead, and assigned-project information.
    const [users] = await db.query(
      `
      SELECT
        u.id,
        u.employee_id,
        u.name,
        u.email,
        u.department,
        u.designation,
        u.role,
        u.status,

        tm.team_lead_id,

        tl.name AS team_lead_name,

        COUNT(
          DISTINCT upa.project_id
        ) AS assigned_project_count,

        GROUP_CONCAT(
          DISTINCT p.project_name
          ORDER BY p.project_name
          SEPARATOR ', '
        ) AS assigned_projects

      FROM users u

      LEFT JOIN team_members tm
        ON tm.member_id = u.id

      LEFT JOIN users tl
        ON tl.id = tm.team_lead_id

      LEFT JOIN user_project_assignments upa
        ON upa.user_id = u.id

      LEFT JOIN projects p
        ON p.id = upa.project_id

      GROUP BY
        u.id,
        u.employee_id,
        u.name,
        u.email,
        u.department,
        u.designation,
        u.role,
        u.status,
        tm.team_lead_id,
        tl.name

      ORDER BY u.name ASC
      `
    );

    // Returns all users required by the Core Team Users table.
    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });

  } catch (error) {
    // Logs user-list errors in the backend terminal.
    console.error("Get All Users Error:", error);

    // Returns an error when user data cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load users",
      error: error.message,
    });
  }
};


// Gets active Team Leads for the Team Lead dropdown.
const getUserTeamLeads = async (req, res) => {
  try {
    // Loads active Team Lead accounts that can manage Indexers.
    const [teamLeads] = await db.query(
      `
      SELECT
        id,
        employee_id,
        name,
        email
      FROM users
      WHERE role = 'teamLead'
        AND status = 'active'
      ORDER BY name ASC
      `
    );

    // Returns Team Leads for the Add/Edit User popup.
    return res.status(200).json({
      success: true,
      count: teamLeads.length,
      teamLeads,
    });

  } catch (error) {
    // Logs Team Lead dropdown errors in the backend terminal.
    console.error("Get User Team Leads Error:", error);

    // Returns an error when Team Leads cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load Team Leads",
      error: error.message,
    });
  }
};


// Gets active projects for the Assigned Projects dropdown.
const getUserProjects = async (req, res) => {
  try {
    // Loads active projects available for employee assignment.
    const [projects] = await db.query(
      `
      SELECT
        id,
        project_code,
        project_name,
        status
      FROM projects
      WHERE status = 'active'
      ORDER BY project_name ASC
      `
    );

    // Returns projects for the Add/Edit User popup.
    return res.status(200).json({
      success: true,
      count: projects.length,
      projects,
    });

  } catch (error) {
    // Logs project-dropdown errors in the backend terminal.
    console.error("Get User Projects Error:", error);

    // Returns an error when projects cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load projects",
      error: error.message,
    });
  }
};


// Creates a user using the exact fields shown in the Core Team Add User popup.
const createUser = async (req, res) => {
  let connection;

  try {
    // Gets the fields submitted from the Add User popup.
    const {
      name,
      email,
      department,
      designation,
      role,
      teamLeadId,
      status = "active",
      projectIds = [],
    } = req.body;

    // Checks that the required popup fields were supplied.
    if (
      !name ||
      !email ||
      !department ||
      !designation ||
      !role
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, email, department, designation and role are required",
      });
    }

    // Defines roles supported by the existing users table.
    const allowedRoles = [
      "indexer",
      "teamLead",
      "coreTeam",
      "administrator",
    ];

    // Prevents unsupported roles from being stored.
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role",
      });
    }

    // Validates the Active/Inactive selection from the popup.
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user status",
      });
    }

    // Requires a Team Lead when the newly created user is an Indexer.
    if (role === "indexer" && !teamLeadId) {
      return res.status(400).json({
        success: false,
        message: "Team Lead is required for an Indexer",
      });
    }

    // Validates that Assigned Projects is an array when supplied.
    if (!Array.isArray(projectIds)) {
      return res.status(400).json({
        success: false,
        message: "projectIds must be an array",
      });
    }

    // Checks whether the email is already used by another employee.
    const [existingEmail] = await db.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    // Prevents duplicate employee email addresses.
    if (existingEmail.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Validates the selected Team Lead when one is required.
    if (role === "indexer") {
      const [teamLeadRows] = await db.query(
        `
        SELECT id
        FROM users
        WHERE id = ?
          AND role = 'teamLead'
          AND status = 'active'
        LIMIT 1
        `,
        [teamLeadId]
      );

      // Stops creation when the selected Team Lead is invalid.
      if (teamLeadRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Selected Team Lead is invalid",
        });
      }
    }

    // Validates every selected project before creating the employee.
    if (projectIds.length > 0) {
      const placeholders =
        projectIds.map(() => "?").join(",");

      const [projectRows] = await db.query(
        `
        SELECT id
        FROM projects
        WHERE id IN (${placeholders})
          AND status = 'active'
        `,
        projectIds
      );

      // Prevents invalid or inactive project assignments.
      if (projectRows.length !== projectIds.length) {
        return res.status(400).json({
          success: false,
          message:
            "One or more selected projects are invalid or inactive",
        });
      }
    }

    // Gets a dedicated database connection for the creation transaction.
    connection = await db.getConnection();

    // Starts a transaction so user, team, and projects are created together.
    await connection.beginTransaction();

    // Automatically generates the employee ID because the popup does not ask for one.
    const employeeId =
      await generateEmployeeId(connection);

    // Automatically generates an initial password because the popup does not ask for one.
    const temporaryPassword =
      generateTemporaryPassword();

    // Hashes the temporary password before storing it.
    const hashedPassword = await bcrypt.hash(
      temporaryPassword,
      10
    );

    // Creates the employee account.
    const [result] = await connection.query(
      `
      INSERT INTO users
      (
        employee_id,
        name,
        email,
        password,
        role,
        department,
        designation,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employeeId,
        name,
        email,
        hashedPassword,
        role,
        department,
        designation,
        status,
      ]
    );

    // Stores the new user's database ID.
    const userId = result.insertId;

    // Adds an Indexer to the selected Team Lead.
    if (role === "indexer") {
      await connection.query(
        `
        INSERT INTO team_members
        (
          team_lead_id,
          member_id
        )
        VALUES (?, ?)
        `,
        [teamLeadId, userId]
      );
    }

    // Assigns every selected project using the shared assignment table.
    for (const projectId of projectIds) {
      await connection.query(
        `
        INSERT INTO user_project_assignments
        (
          user_id,
          project_id
        )
        VALUES (?, ?)
        `,
        [userId, projectId]
      );
    }

    // Commits all user-management changes together.
    await connection.commit();

    // Returns generated account details after successful creation.
    return res.status(201).json({
      success: true,
      message: "User created successfully",

      user: {
        id: userId,
        employeeId,
        name,
        email,
        role,
      },

      // Returns the temporary password only once so it can be given to the employee.
      temporaryPassword,
    });

  } catch (error) {
    // Rolls back all database changes if user creation fails.
    if (connection) {
      await connection.rollback();
    }

    // Logs user-creation errors in the backend terminal.
    console.error("Create User Error:", error);

    // Returns an error when the user cannot be created.
    return res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });

  } finally {
    // Releases the transaction connection back to the database pool.
    if (connection) {
      connection.release();
    }
  }
};


// Updates the editable fields shown in the Core Team Edit User popup.
const updateUser = async (req, res) => {
  let connection;

  try {
    // Gets the selected employee's database ID from the URL.
    const userId = req.params.id;

    // Gets editable values from the User Details popup.
    const {
      name,
      email,
      department,
      designation,
      role,
      teamLeadId,
      status,
      projectIds,
    } = req.body;

    // Checks that the employee exists before updating.
    const [existingRows] = await db.query(
      `
      SELECT id, role
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    // Stops when the selected employee does not exist.
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Checks whether another account already uses the requested email.
    if (email) {
      const [duplicateEmail] = await db.query(
        `
        SELECT id
        FROM users
        WHERE email = ?
          AND id != ?
        LIMIT 1
        `,
        [email, userId]
      );

      // Prevents duplicate email addresses during editing.
      if (duplicateEmail.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    // Determines which role the employee will have after the update.
    const finalRole =
      role || existingRows[0].role;

    // Gets a dedicated connection for synchronised user updates.
    connection = await db.getConnection();

    // Starts a transaction so user, team, and project assignments stay synchronized.
    await connection.beginTransaction();

    // Updates the basic employee fields.
    await connection.query(
      `
      UPDATE users
      SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        department = COALESCE(?, department),
        designation = COALESCE(?, designation),
        role = COALESCE(?, role),
        status = COALESCE(?, status)
      WHERE id = ?
      `,
      [
        name || null,
        email || null,
        department || null,
        designation || null,
        role || null,
        status || null,
        userId,
      ]
    );

    // Removes old team membership before rebuilding Indexer team assignment.
    if (
      finalRole !== "indexer" ||
      teamLeadId !== undefined
    ) {
      await connection.query(
        `
        DELETE FROM team_members
        WHERE member_id = ?
        `,
        [userId]
      );
    }

    // Adds the Indexer to the selected Team Lead when supplied.
    if (
      finalRole === "indexer" &&
      teamLeadId !== undefined
    ) {
      await connection.query(
        `
        INSERT INTO team_members
        (
          team_lead_id,
          member_id
        )
        VALUES (?, ?)
        `,
        [teamLeadId, userId]
      );
    }

    // Replaces project assignments when projectIds is included in the request.
    if (Array.isArray(projectIds)) {
      // Removes the employee's previous direct project assignments.
      await connection.query(
        `
        DELETE FROM user_project_assignments
        WHERE user_id = ?
        `,
        [userId]
      );

      // Adds the employee's newly selected projects.
      for (const projectId of projectIds) {
        await connection.query(
          `
          INSERT INTO user_project_assignments
          (
            user_id,
            project_id
          )
          VALUES (?, ?)
          `,
          [userId, projectId]
        );
      }
    }

    // Commits all employee changes after successful validation and updates.
    await connection.commit();

    // Returns success after updating the employee.
    return res.status(200).json({
      success: true,
      message: "User updated successfully",
    });

  } catch (error) {
    // Rolls back employee changes if any update operation fails.
    if (connection) {
      await connection.rollback();
    }

    // Logs user-update errors in the backend terminal.
    console.error("Update User Error:", error);

    // Returns an error when the user cannot be updated.
    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });

  } finally {
    // Releases the database connection after the transaction finishes.
    if (connection) {
      connection.release();
    }
  }
};


// Exports all Core Team User Management functions.
module.exports = {
  getAllUsers,
  getUserTeamLeads,
  getUserProjects,
  createUser,
  updateUser,
};