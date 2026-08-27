// Imports the MySQL database connection.
const db = require("../config/db");


// Gets all projects for the Core Team Project Master screen.
const getAllProjects = async (req, res) => {
  try {
    // Loads project details together with assigned Team Lead and calculated team size.
    const [projects] = await db.query(
      `
      SELECT
        p.id,
        p.project_code,
        p.project_name,
        p.client_name,
        p.reporting_category,
        p.auto_lock_time,
        p.start_date,
        p.status,
        p.team_lead_id,

        u.name AS team_lead_name,

        COUNT(
          DISTINCT upa.user_id
        ) AS team_size

      FROM projects p

      LEFT JOIN users u
        ON u.id = p.team_lead_id

      LEFT JOIN user_project_assignments upa
        ON upa.project_id = p.id

      GROUP BY
        p.id,
        p.project_code,
        p.project_name,
        p.client_name,
        p.reporting_category,
        p.auto_lock_time,
        p.start_date,
        p.status,
        p.team_lead_id,
        u.name

      ORDER BY p.id ASC
      `
    );

    // Returns all Project Master records to the Core Team.
    return res.status(200).json({
      success: true,
      count: projects.length,
      projects,
    });

  } catch (error) {
    // Logs project-loading errors in the backend terminal.
    console.error("Get All Projects Error:", error);

    // Returns an error when project data cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load projects",
      error: error.message,
    });
  }
};


// Creates a new project from the Core Team Project Master popup.
const createProject = async (req, res) => {
  try {
    // Gets all project fields submitted from the frontend or Postman.
    const {
      projectCode,
      projectName,
      clientName,
      reportingCategory,
      autoLockTime,
      teamLeadId,
      startDate,
      status,
    } = req.body;

    // Checks required project fields before creating the project.
    if (
      !projectCode ||
      !projectName ||
      !reportingCategory ||
      !status
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Project code, project name, reporting category and status are required",
      });
    }

    // Checks whether the project code already exists.
    const [existingProject] = await db.query(
      `
      SELECT id
      FROM projects
      WHERE project_code = ?
      LIMIT 1
      `,
      [projectCode]
    );

    // Prevents duplicate project codes.
    if (existingProject.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Project code already exists",
      });
    }

    // Validates the assigned Team Lead when one is provided.
    if (teamLeadId) {
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

      // Stops project creation when the selected Team Lead is invalid.
      if (teamLeadRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Selected Team Lead is invalid",
        });
      }
    }

    // Inserts the new project into the projects table.
    const [result] = await db.query(
      `
      INSERT INTO projects
      (
        project_code,
        project_name,
        client_name,
        reporting_category,
        auto_lock_time,
        team_lead_id,
        start_date,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        projectCode,
        projectName,
        clientName || null,
        reportingCategory,
        autoLockTime || null,
        teamLeadId || null,
        startDate || null,
        status,
      ]
    );

    // Returns success with the newly created project ID.
    return res.status(201).json({
      success: true,
      message: "Project created successfully",
      projectId: result.insertId,
    });

  } catch (error) {
    // Logs project-creation errors in the backend terminal.
    console.error("Create Project Error:", error);

    // Returns an error when project creation fails.
    return res.status(500).json({
      success: false,
      message: "Failed to create project",
      error: error.message,
    });
  }
};


// Updates an existing project from the Core Team Project Master edit popup.
const updateProject = async (req, res) => {
  try {
    // Gets the project ID from the request URL.
    const projectId = req.params.id;

    // Gets the editable project fields from the request body.
    const {
      projectCode,
      projectName,
      clientName,
      reportingCategory,
      autoLockTime,
      teamLeadId,
      startDate,
      status,
    } = req.body;

    // Checks whether the selected project exists.
    const [projectRows] = await db.query(
      `
      SELECT id
      FROM projects
      WHERE id = ?
      LIMIT 1
      `,
      [projectId]
    );

    // Stops the update when the project cannot be found.
    if (projectRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Checks whether another project already uses the requested project code.
    if (projectCode) {
      const [duplicateCode] = await db.query(
        `
        SELECT id
        FROM projects
        WHERE project_code = ?
          AND id != ?
        LIMIT 1
        `,
        [projectCode, projectId]
      );

      // Prevents duplicate project codes during editing.
      if (duplicateCode.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Project code already exists",
        });
      }
    }

    // Validates the assigned Team Lead when one is provided.
    if (teamLeadId) {
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

      // Stops the update when the selected Team Lead is invalid.
      if (teamLeadRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Selected Team Lead is invalid",
        });
      }
    }

    // Updates only the Project Master fields for the selected project.
    await db.query(
      `
      UPDATE projects
      SET
        project_code = COALESCE(?, project_code),
        project_name = COALESCE(?, project_name),
        client_name = ?,
        reporting_category = COALESCE(?, reporting_category),
        auto_lock_time = ?,
        team_lead_id = ?,
        start_date = ?,
        status = COALESCE(?, status)
      WHERE id = ?
      `,
      [
        projectCode || null,
        projectName || null,
        clientName ?? null,
        reportingCategory || null,
        autoLockTime ?? null,
        teamLeadId ?? null,
        startDate ?? null,
        status || null,
        projectId,
      ]
    );

    // Returns success after updating the project.
    return res.status(200).json({
      success: true,
      message: "Project updated successfully",
    });

  } catch (error) {
    // Logs project-update errors in the backend terminal.
    console.error("Update Project Error:", error);

    // Returns an error when the project cannot be updated.
    return res.status(500).json({
      success: false,
      message: "Failed to update project",
      error: error.message,
    });
  }
};


// Gets active Team Leads for the Project Master "Assigned team" dropdown.
const getTeamLeads = async (req, res) => {
  try {
    // Loads active Team Lead accounts available for project assignment.
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

    // Returns Team Leads for the Project Master dropdown.
    return res.status(200).json({
      success: true,
      count: teamLeads.length,
      teamLeads,
    });

  } catch (error) {
    // Logs Team Lead dropdown errors in the backend terminal.
    console.error("Get Team Leads Error:", error);

    // Returns an error when Team Leads cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load Team Leads",
      error: error.message,
    });
  }
};


// Exports all Project Master controller functions so the routes can use them.
module.exports = {
  getAllProjects,
  createProject,
  updateProject,
  getTeamLeads,
};