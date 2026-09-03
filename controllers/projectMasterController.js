// Imports the shared MySQL database connection pool.
const db = require("../config/db");


// ============================================================
// 1. GET ALL PROJECTS
// ============================================================

// Gets all projects for the Core Team Project Master screen.
const getAllProjects = async (req, res) => {
  try {
    // Loads projects with reporting category and calculated assigned team size.
    const [projects] = await db.query(
      `
      SELECT
        p.project_id AS id,
        p.project_code,
        p.project_name,
        p.client_name,

        p.category_id,
        rc.name AS reporting_category,

        p.auto_lock_time,
        p.grace_minutes,

        DATE_FORMAT(
          p.start_date,
          '%Y-%m-%d'
        ) AS start_date,

        DATE_FORMAT(
          p.end_date,
          '%Y-%m-%d'
        ) AS end_date,

        p.status,

        COUNT(
          DISTINCT pa.user_id
        ) AS team_size

      FROM project p

      LEFT JOIN reporting_category rc
        ON rc.category_id = p.category_id

      LEFT JOIN project_assignment pa
        ON pa.project_id = p.project_id

      GROUP BY
        p.project_id,
        p.project_code,
        p.project_name,
        p.client_name,
        p.category_id,
        rc.name,
        p.auto_lock_time,
        p.grace_minutes,
        p.start_date,
        p.end_date,
        p.status

      ORDER BY p.project_id ASC
      `
    );

    // Converts calculated MySQL values into normal JavaScript numbers.
    const formattedProjects = projects.map((project) => ({
      ...project,
      team_size: Number(project.team_size),
    }));

    // Returns all projects to the frontend.
    return res.status(200).json({
      success: true,
      count: formattedProjects.length,
      projects: formattedProjects,
    });
  } catch (error) {
    // Logs project loading errors in the backend terminal.
    console.error("Get All Projects Error:", error);

    // Returns an error when projects cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load projects",
      error: error.message,
    });
  }
};


// ============================================================
// 2. GET TEAM LEADS
// ============================================================

// Gets all active Team Leads for the Project Master dropdown.
const getTeamLeads = async (req, res) => {
  try {
    // Loads active users whose normalized role code is lead.
    const [teamLeads] = await db.query(
      `
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
      `
    );

    // Returns Team Lead dropdown values.
    return res.status(200).json({
      success: true,
      count: teamLeads.length,
      teamLeads,
    });
  } catch (error) {
    // Logs Team Lead loading errors.
    console.error("Get Team Leads Error:", error);

    // Returns an error when Team Leads cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load Team Leads",
      error: error.message,
    });
  }
};


// ============================================================
// 3. GET REPORTING CATEGORIES
// ============================================================

// Gets reporting categories for the Project Master category dropdown.
const getReportingCategories = async (req, res) => {
  try {
    // Loads all available reporting categories.
    const [categories] = await db.query(
      `
      SELECT
        category_id,
        name

      FROM reporting_category

      ORDER BY name ASC
      `
    );

    // Returns category dropdown data.
    return res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    // Logs reporting-category loading errors.
    console.error(
      "Get Reporting Categories Error:",
      error
    );

    // Returns an error when categories cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load reporting categories",
      error: error.message,
    });
  }
};


// ============================================================
// 4. CREATE PROJECT
// ============================================================

// Creates a new project from the Core Team Project Master screen.
const createProject = async (req, res) => {
  // Stores the MySQL connection used for the transaction.
  let connection;

  try {
    // Reads project details submitted by the frontend or Postman.
    const {
      projectCode,
      projectName,
      clientName,
      categoryId,
      autoLockTime,
      graceMinutes,
      teamLeadId,
      startDate,
      endDate,
      status = "active",
    } = req.body;

    // Validates the required project fields.
    if (
      !projectCode ||
      !projectName ||
      !categoryId ||
      !status
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Project code, project name, reporting category and status are required",
      });
    }

    // Validates the project status supported by the database.
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be active or inactive",
      });
    }

    // Converts the project code into its normalized uppercase form.
    const normalizedProjectCode =
      projectCode.trim().toUpperCase();

    // Checks whether another project already uses this project code.
    const [existingProjects] = await db.query(
      `
      SELECT project_id

      FROM project

      WHERE project_code = ?

      LIMIT 1
      `,
      [normalizedProjectCode]
    );

    // Prevents duplicate project codes.
    if (existingProjects.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Project code already exists",
      });
    }

    // Checks whether the selected reporting category exists.
    const [categoryRows] = await db.query(
      `
      SELECT category_id

      FROM reporting_category

      WHERE category_id = ?

      LIMIT 1
      `,
      [categoryId]
    );

    // Stops project creation when the category is invalid.
    if (categoryRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid reporting category",
      });
    }

    // Validates the selected Team Lead when one is supplied.
    if (
      teamLeadId !== undefined &&
      teamLeadId !== null &&
      teamLeadId !== ""
    ) {
      const [teamLeadRows] = await db.query(
        `
        SELECT
          u.user_id

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

      // Stops project creation when the Team Lead is invalid.
      if (teamLeadRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Selected Team Lead is invalid",
        });
      }
    }

    // Gets one database connection for the complete transaction.
    connection = await db.getConnection();

    // Starts the project creation transaction.
    await connection.beginTransaction();

    // Inserts the new project using the official project table.
    const [result] = await connection.query(
      `
      INSERT INTO project (
        project_code,
        project_name,
        client_name,
        category_id,
        status,
        start_date,
        end_date,
        auto_lock_time,
        grace_minutes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        normalizedProjectCode,
        projectName.trim(),
        clientName?.trim() || null,
        Number(categoryId),
        status,
        startDate || null,
        endDate || null,
        autoLockTime || null,
        Number(graceMinutes) || 0,
      ]
    );

    // Stores the ID generated by MySQL for the new project.
    const newProjectId = result.insertId;

    // Assigns the selected Team Lead to the new project when supplied.
    if (
      teamLeadId !== undefined &&
      teamLeadId !== null &&
      teamLeadId !== ""
    ) {
      await connection.query(
        `
        INSERT INTO project_assignment (
          user_id,
          project_id,
          assigned_by
        )
        VALUES (?, ?, ?)
        `,
        [
          Number(teamLeadId),
          newProjectId,
          req.user?.id || null,
        ]
      );
    }

    // Loads the newly created project for the API response.
    const [newProjectRows] = await connection.query(
      `
      SELECT
        p.project_id AS id,
        p.project_code,
        p.project_name,
        p.client_name,

        p.category_id,
        rc.name AS reporting_category,

        p.auto_lock_time,
        p.grace_minutes,

        DATE_FORMAT(
          p.start_date,
          '%Y-%m-%d'
        ) AS start_date,

        DATE_FORMAT(
          p.end_date,
          '%Y-%m-%d'
        ) AS end_date,

        p.status,

        COUNT(
          DISTINCT pa.user_id
        ) AS team_size

      FROM project p

      LEFT JOIN reporting_category rc
        ON rc.category_id = p.category_id

      LEFT JOIN project_assignment pa
        ON pa.project_id = p.project_id

      WHERE p.project_id = ?

      GROUP BY
        p.project_id,
        p.project_code,
        p.project_name,
        p.client_name,
        p.category_id,
        rc.name,
        p.auto_lock_time,
        p.grace_minutes,
        p.start_date,
        p.end_date,
        p.status

      LIMIT 1
      `,
      [newProjectId]
    );

    // Saves the project and optional Team Lead assignment.
    await connection.commit();

    // Formats the calculated team size as a JavaScript number.
    const createdProject = {
      ...newProjectRows[0],
      team_size: Number(
        newProjectRows[0]?.team_size || 0
      ),
    };

    // Returns the newly created project.
    return res.status(201).json({
      success: true,
      message: "Project created successfully",
      project: createdProject,
    });
  } catch (error) {
    // Rolls back all creation changes when an error occurs.
    if (connection) {
      await connection.rollback();
    }

    // Logs the complete project creation error.
    console.error("Create Project Error:", error);

    // Returns the project creation error.
    return res.status(500).json({
      success: false,
      message: "Failed to create project",
      error: error.message,
    });
  } finally {
    // Releases the database connection after the request finishes.
    if (connection) {
      connection.release();
    }
  }
};


// ============================================================
// 5. UPDATE PROJECT
// ============================================================

// Updates an existing project from the Core Team Project Master screen.
const updateProject = async (req, res) => {
  // Stores the MySQL connection used for the transaction.
  let connection;

  try {
    // Gets the project ID directly from the PATCH route.
    const projectId = req.params.id;

    // Reads all editable project fields from the request body.
    const {
      projectCode,
      projectName,
      clientName,
      categoryId,
      autoLockTime,
      graceMinutes,
      teamLeadId,
      startDate,
      endDate,
      status,
    } = req.body;

    // Checks whether the requested project exists.
    const [projectRows] = await db.query(
      `
      SELECT project_id

      FROM project

      WHERE project_id = ?

      LIMIT 1
      `,
      [projectId]
    );

    // Stops when the requested project does not exist.
    if (projectRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Validates status only when the frontend sends it.
    if (
      status !== undefined &&
      !["active", "inactive"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Status must be active or inactive",
      });
    }

    // Checks for duplicate project codes when projectCode is supplied.
    if (projectCode) {
      // Converts the supplied project code into uppercase.
      const normalizedProjectCode =
        projectCode.trim().toUpperCase();

      // Searches for another project using the same code.
      const [duplicateRows] = await db.query(
        `
        SELECT project_id

        FROM project

        WHERE project_code = ?
          AND project_id <> ?

        LIMIT 1
        `,
        [
          normalizedProjectCode,
          projectId,
        ]
      );

      // Prevents another project from using the same code.
      if (duplicateRows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Project code already exists",
        });
      }
    }

    // Validates categoryId only when it is supplied.
    if (
      categoryId !== undefined &&
      categoryId !== null
    ) {
      const [categoryRows] = await db.query(
        `
        SELECT category_id

        FROM reporting_category

        WHERE category_id = ?

        LIMIT 1
        `,
        [categoryId]
      );

      // Stops the update when the reporting category is invalid.
      if (categoryRows.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Selected reporting category is invalid",
        });
      }
    }

    // Validates Team Lead only when a non-empty Team Lead ID is supplied.
    if (
      teamLeadId !== undefined &&
      teamLeadId !== null &&
      teamLeadId !== ""
    ) {
      const [teamLeadRows] = await db.query(
        `
        SELECT
          u.user_id

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

      // Stops the update when the selected Team Lead is invalid.
      if (teamLeadRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Selected Team Lead is invalid",
        });
      }
    }

    // Gets one database connection for the update transaction.
    connection = await db.getConnection();

    // Starts the transaction.
    await connection.beginTransaction();

    // Updates the project fields supplied in the PATCH request.
    await connection.query(
      `
      UPDATE project

      SET
        project_code =
          COALESCE(?, project_code),

        project_name =
          COALESCE(?, project_name),

        client_name =
          COALESCE(?, client_name),

        category_id =
          COALESCE(?, category_id),

        auto_lock_time =
          COALESCE(?, auto_lock_time),

        grace_minutes =
          COALESCE(?, grace_minutes),

        start_date =
          COALESCE(?, start_date),

        end_date =
          COALESCE(?, end_date),

        status =
          COALESCE(?, status)

      WHERE project_id = ?
      `,
      [
        projectCode
          ? projectCode.trim().toUpperCase()
          : null,

        projectName
          ? projectName.trim()
          : null,

        clientName ?? null,

        categoryId ?? null,

        autoLockTime ?? null,

        graceMinutes ?? null,

        startDate ?? null,

        endDate ?? null,

        status ?? null,

        projectId,
      ]
    );

    // Updates Team Lead assignment only when teamLeadId is included in the request.
    if (teamLeadId !== undefined) {
      // Removes any existing Team Lead assignment for this project.
      await connection.query(
        `
        DELETE pa

        FROM project_assignment pa

        INNER JOIN users u
          ON u.user_id = pa.user_id

        INNER JOIN role r
          ON r.role_id = u.role_id

        WHERE pa.project_id = ?
          AND r.code = 'lead'
        `,
        [projectId]
      );

      // Adds the newly selected Team Lead when a valid ID is supplied.
      if (
        teamLeadId !== null &&
        teamLeadId !== ""
      ) {
        await connection.query(
          `
          INSERT INTO project_assignment (
            user_id,
            project_id,
            assigned_by
          )
          VALUES (?, ?, ?)
          `,
          [
            Number(teamLeadId),
            projectId,
            req.user?.id || null,
          ]
        );
      }
    }

    // Saves the project update and Team Lead changes.
    await connection.commit();

    // Loads the latest version of the updated project.
    const [updatedProjectRows] = await db.query(
      `
      SELECT
        p.project_id AS id,
        p.project_code,
        p.project_name,
        p.client_name,

        p.category_id,
        rc.name AS reporting_category,

        p.auto_lock_time,
        p.grace_minutes,

        DATE_FORMAT(
          p.start_date,
          '%Y-%m-%d'
        ) AS start_date,

        DATE_FORMAT(
          p.end_date,
          '%Y-%m-%d'
        ) AS end_date,

        p.status,

        COUNT(
          DISTINCT pa.user_id
        ) AS team_size

      FROM project p

      LEFT JOIN reporting_category rc
        ON rc.category_id = p.category_id

      LEFT JOIN project_assignment pa
        ON pa.project_id = p.project_id

      WHERE p.project_id = ?

      GROUP BY
        p.project_id,
        p.project_code,
        p.project_name,
        p.client_name,
        p.category_id,
        rc.name,
        p.auto_lock_time,
        p.grace_minutes,
        p.start_date,
        p.end_date,
        p.status

      LIMIT 1
      `,
      [projectId]
    );

    // Formats the updated project's team size as a number.
    const updatedProject = {
      ...updatedProjectRows[0],
      team_size: Number(
        updatedProjectRows[0]?.team_size || 0
      ),
    };

    // Returns the successfully updated project.
    return res.status(200).json({
      success: true,
      message: "Project updated successfully",
      project: updatedProject,
    });
  } catch (error) {
    // Rolls back the update when an error occurs.
    if (connection) {
      await connection.rollback();
    }

    // Logs the complete update error.
    console.error("Update Project Error:", error);

    // Returns the update failure to Postman or the frontend.
    return res.status(500).json({
      success: false,
      message: "Failed to update project",
      error: error.message,
    });
  } finally {
    // Releases the database connection after the request finishes.
    if (connection) {
      connection.release();
    }
  }
};

// ============================================================
// 6. GET PROJECT FIELDS
// ============================================================

// Gets all dynamic Daily Entry fields configured for one project.
const getProjectFields = async (req, res) => {
  try {
    // Converts the project ID from the URL into a number.
    const projectId = Number(req.params.id);

    // Rejects an invalid project ID before querying the database.
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    // Checks whether the requested project exists.
    const [projectRows] = await db.query(
      `
      SELECT
        project_id,
        project_code,
        project_name

      FROM project

      WHERE project_id = ?

      LIMIT 1
      `,
      [projectId]
    );

    // Returns 404 when the requested project does not exist.
    if (projectRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Loads the dynamic fields configured for the selected project.
    const [fields] = await db.query(
      `
      SELECT
        field_id AS id,
        project_id,
        field_key,
        label,
        data_type,
        is_mandatory,
        sort_order

      FROM project_field

      WHERE project_id = ?

      ORDER BY
        sort_order ASC,
        field_id ASC
      `,
      [projectId]
    );

    // Converts MySQL numeric values into normal JavaScript values.
    const formattedFields = fields.map((field) => ({
      id: field.id,
      project_id: field.project_id,
      field_key: field.field_key,
      label: field.label,
      data_type: field.data_type,

      // Converts MySQL TINYINT 0/1 into a frontend-friendly boolean.
      is_mandatory: Boolean(field.is_mandatory),

      sort_order: Number(field.sort_order),
    }));

    // Returns the project and its configured dynamic fields.
    return res.status(200).json({
      success: true,

      project: {
        id: projectRows[0].project_id,
        project_code: projectRows[0].project_code,
        project_name: projectRows[0].project_name,
      },

      count: formattedFields.length,
      fields: formattedFields,
    });
  } catch (error) {
    // Logs the complete error in the backend terminal for debugging.
    console.error(
      "Get Project Fields Error:",
      error
    );

    // Returns a safe API error response.
    return res.status(500).json({
      success: false,
      message: "Failed to load project fields",
      error: error.message,
    });
  }
};


// ============================================================
// EXPORTS
// ============================================================

// Exports all Project Master controller functions for the routes file.
module.exports = {
  getAllProjects,
  createProject,
  updateProject,
  getTeamLeads,
  getReportingCategories,
  getProjectFields,
};