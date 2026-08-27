const db = require("../config/db");


// ============================================================
// 1. GET ALL PROJECTS
// ============================================================

const getAllProjects = async (req, res) => {
  try {
    const [projects] = await db.query(`
      SELECT
        p.project_id AS id,
        p.project_code,
        p.project_name,
        p.client_name,

        p.category_id,
        rc.name AS reporting_category,

        p.auto_lock_time,
        p.start_date,
        p.end_date,
        p.status,

        COUNT(
          DISTINCT pa.user_id
        ) AS team_size,

        GROUP_CONCAT(
          DISTINCT
          CASE
            WHEN r.code = 'lead'
            THEN u.full_name
          END
          ORDER BY u.full_name
          SEPARATOR ', '
        ) AS team_lead_name

      FROM project p

      LEFT JOIN reporting_category rc
        ON rc.category_id = p.category_id

      LEFT JOIN project_assignment pa
        ON pa.project_id = p.project_id

      LEFT JOIN users u
        ON u.user_id = pa.user_id

      LEFT JOIN role r
        ON r.role_id = u.role_id

      GROUP BY
        p.project_id,
        p.project_code,
        p.project_name,
        p.client_name,
        p.category_id,
        rc.name,
        p.auto_lock_time,
        p.start_date,
        p.end_date,
        p.status

      ORDER BY p.project_id ASC
    `);

    const formattedProjects = projects.map(
      (project) => ({
        id: project.id,
        project_code: project.project_code,
        project_name: project.project_name,
        client_name: project.client_name,
        category_id: project.category_id,
        reporting_category:
          project.reporting_category,
        auto_lock_time:
          project.auto_lock_time,
        start_date: project.start_date,
        end_date: project.end_date,
        status: project.status,
        team_size: Number(
          project.team_size || 0
        ),
        team_lead_name:
          project.team_lead_name || null,
      })
    );

    return res.status(200).json({
      success: true,
      count: formattedProjects.length,
      projects: formattedProjects,
    });

  } catch (error) {
    console.error(
      "Get All Projects Error:",
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
// 2. GET TEAM LEADS
// ============================================================

const getTeamLeads = async (req, res) => {
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
      "Get Team Leads Error:",
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
// 3. GET REPORTING CATEGORIES
// ============================================================

const getReportingCategories = async (
  req,
  res
) => {
  try {
    const [categories] = await db.query(`
      SELECT
        category_id,
        name
      FROM reporting_category
      ORDER BY name ASC
    `);

    return res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });

  } catch (error) {
    console.error(
      "Get Reporting Categories Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load reporting categories",
      error: error.message,
    });
  }
};


// ============================================================
// 4. CREATE PROJECT
// ============================================================

const createProject = async (req, res) => {
  let connection;

  try {
    const {
      projectCode,
      projectName,
      clientName,
      categoryId,
      autoLockTime,
      teamLeadId,
      startDate,
      endDate,
      status = "active",
    } = req.body;


    // --------------------------------------------------------
    // Required fields
    // --------------------------------------------------------
    if (
      !projectCode ||
      !projectName ||
      !status
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Project code, project name and status are required",
      });
    }


    // --------------------------------------------------------
    // Validate status
    // --------------------------------------------------------
    if (
      !["active", "inactive"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid project status",
      });
    }


    // --------------------------------------------------------
    // Duplicate project code
    // --------------------------------------------------------
    const [existingProject] =
      await db.query(
        `
        SELECT project_id
        FROM project
        WHERE project_code = ?
        LIMIT 1
        `,
        [projectCode]
      );

    if (existingProject.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Project code already exists",
      });
    }


    // --------------------------------------------------------
    // Validate reporting category
    // --------------------------------------------------------
    if (categoryId) {
      const [categoryRows] =
        await db.query(
          `
          SELECT category_id
          FROM reporting_category
          WHERE category_id = ?
          LIMIT 1
          `,
          [categoryId]
        );

      if (categoryRows.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Selected reporting category is invalid",
        });
      }
    }


    // --------------------------------------------------------
    // Validate Team Lead
    // --------------------------------------------------------
    if (teamLeadId) {
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
    // Begin transaction
    // --------------------------------------------------------
    connection = await db.getConnection();

    await connection.beginTransaction();


    // --------------------------------------------------------
    // Create project
    // --------------------------------------------------------
    const [result] =
      await connection.query(
        `
        INSERT INTO project
        (
          project_code,
          project_name,
          client_name,
          category_id,
          status,
          start_date,
          end_date,
          auto_lock_time
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          projectCode,
          projectName,
          clientName || null,
          categoryId || null,
          status,
          startDate || null,
          endDate || null,
          autoLockTime || null,
        ]
      );

    const projectId = result.insertId;


    // --------------------------------------------------------
    // Assign Team Lead to project
    // --------------------------------------------------------
    if (teamLeadId) {
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
          teamLeadId,
          projectId,
          req.user?.id || null,
        ]
      );
    }


    await connection.commit();


    return res.status(201).json({
      success: true,
      message:
        "Project created successfully",
      projectId,
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(
      "Create Project Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to create project",
      error: error.message,
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// ============================================================
// 5. UPDATE PROJECT
// ============================================================

const updateProject = async (req, res) => {
  let connection;

  try {
    const projectId = req.params.id;

    const {
      projectCode,
      projectName,
      clientName,
      categoryId,
      autoLockTime,
      teamLeadId,
      startDate,
      endDate,
      status,
    } = req.body;


    // --------------------------------------------------------
    // Verify project exists
    // --------------------------------------------------------
    const [projectRows] =
      await db.query(
        `
        SELECT project_id
        FROM project
        WHERE project_id = ?
        LIMIT 1
        `,
        [projectId]
      );

    if (projectRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }


    // --------------------------------------------------------
    // Duplicate project code check
    // --------------------------------------------------------
    if (projectCode) {
      const [duplicateRows] =
        await db.query(
          `
          SELECT project_id
          FROM project
          WHERE project_code = ?
            AND project_id <> ?
          LIMIT 1
          `,
          [
            projectCode,
            projectId,
          ]
        );

      if (duplicateRows.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Project code already exists",
        });
      }
    }


    // --------------------------------------------------------
    // Validate category
    // --------------------------------------------------------
    if (categoryId) {
      const [categoryRows] =
        await db.query(
          `
          SELECT category_id
          FROM reporting_category
          WHERE category_id = ?
          LIMIT 1
          `,
          [categoryId]
        );

      if (categoryRows.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Selected reporting category is invalid",
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


    connection = await db.getConnection();

    await connection.beginTransaction();


    // --------------------------------------------------------
    // Update project
    // --------------------------------------------------------
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

        start_date =
          COALESCE(?, start_date),

        end_date =
          COALESCE(?, end_date),

        status =
          COALESCE(?, status)

      WHERE project_id = ?
      `,
      [
        projectCode || null,
        projectName || null,
        clientName ?? null,
        categoryId ?? null,
        autoLockTime ?? null,
        startDate ?? null,
        endDate ?? null,
        status || null,
        projectId,
      ]
    );


    // --------------------------------------------------------
    // Update Team Lead assignment
    //
    // Only runs if teamLeadId was included.
    // --------------------------------------------------------
    if (teamLeadId !== undefined) {

      // Remove existing lead assignments.
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


      // Add selected Team Lead.
      if (teamLeadId) {
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
            teamLeadId,
            projectId,
            req.user?.id || null,
          ]
        );
      }
    }


    await connection.commit();


    return res.status(200).json({
      success: true,
      message:
        "Project updated successfully",
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(
      "Update Project Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update project",
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
  getAllProjects,
  createProject,
  updateProject,
  getTeamLeads,
  getReportingCategories,
};