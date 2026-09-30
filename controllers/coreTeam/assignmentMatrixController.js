const db = require("../../config/db");
const {
  INDEXER_ROLE_SQL,
  TEAM_LEAD_ROLE_SQL,
  CORE_TEAM_ROLE_SQL,
  ADMIN_ROLE_SQL,
  normalizeRoleCode,
} = require("../../utils/roleSql");


// ============================================================
// 1. GET ASSIGNMENT MATRIX
// ============================================================

const getAssignmentMatrix = async (req, res) => {
  try {
    // --------------------------------------------------------
    // Load all projects.
    //
    // We include inactive projects too because your reference
    // screen also shows Neuro Scan even though it is inactive.
    // --------------------------------------------------------
    const [projects] = await db.query(`
      SELECT
        project_id AS id,
        project_code,
        project_name,
        status
      FROM project
      ORDER BY project_id ASC
    `);


    // --------------------------------------------------------
    // Load active users and their roles.
    // --------------------------------------------------------
    const [users] = await db.query(`
      SELECT
        u.user_id AS id,
        u.emp_code AS employee_id,
        u.full_name AS name,
        u.team_lead_id,

        r.role_id,
        r.code AS role

      FROM users u

      INNER JOIN role r
        ON r.role_id = u.role_id

      WHERE u.status = 'active'

      ORDER BY
        CASE
          WHEN ${INDEXER_ROLE_SQL} THEN 1
          WHEN ${TEAM_LEAD_ROLE_SQL} THEN 2
          WHEN ${CORE_TEAM_ROLE_SQL} THEN 3
          WHEN ${ADMIN_ROLE_SQL} THEN 4
          ELSE 5
        END,
        u.full_name ASC
    `);


    // --------------------------------------------------------
    // Load direct project assignments.
    // --------------------------------------------------------
    const [directAssignments] = await db.query(`
      SELECT
        user_id,
        project_id

      FROM project_assignment
    `);


    // --------------------------------------------------------
    // Build direct assignment map:
    //
    // {
    //   userId: Set(projectIds)
    // }
    // --------------------------------------------------------
    const directMap = {};

    directAssignments.forEach((assignment) => {
      if (!directMap[assignment.user_id]) {
        directMap[assignment.user_id] =
          new Set();
      }

      directMap[assignment.user_id].add(
        Number(assignment.project_id)
      );
    });


    // --------------------------------------------------------
    // Find projects inherited by Team Leads from Indexers
    // reporting to them.
    // --------------------------------------------------------
    const [leadInheritedRows] = await db.query(`
      SELECT DISTINCT
        indexer.team_lead_id AS lead_id,
        pa.project_id

      FROM users indexer

      INNER JOIN role r
        ON r.role_id = indexer.role_id

      INNER JOIN project_assignment pa
        ON pa.user_id = indexer.user_id

      WHERE ${INDEXER_ROLE_SQL}
        AND indexer.status = 'active'
        AND indexer.team_lead_id IS NOT NULL
    `);


    const inheritedMap = {};

    leadInheritedRows.forEach((row) => {
      if (!inheritedMap[row.lead_id]) {
        inheritedMap[row.lead_id] =
          new Set();
      }

      inheritedMap[row.lead_id].add(
        Number(row.project_id)
      );
    });


    const allProjectIds = projects.map(
      (project) => Number(project.id)
    );


    // --------------------------------------------------------
    // Build matrix rows.
    // --------------------------------------------------------
    const matrixUsers = users.map((user) => {
      let projectIds = [];
      let editable = false;
      let accessType = "direct";
      const role = normalizeRoleCode(user.role);


      // Indexers use direct assignments.
      if (role === "indexer") {
        projectIds = [
          ...(directMap[user.id] || []),
        ];

        editable = true;
        accessType = "direct";
      }


      // Team Leads inherit projects from their Indexers.
      else if (role === "lead") {
        const direct = directMap[user.id]
          ? [...directMap[user.id]]
          : [];

        const inherited =
          inheritedMap[user.id]
            ? [...inheritedMap[user.id]]
            : [];

        projectIds = [
          ...new Set([
            ...direct,
            ...inherited,
          ]),
        ];

        editable = false;
        accessType = "inherited";
      }


      // Core Team always has access to everything.
      else if (role === "core") {
        projectIds = [...allProjectIds];

        editable = false;
        accessType = "global";
      }


      // Administrator always has access to everything.
      else if (role === "admin") {
        projectIds = [...allProjectIds];

        editable = false;
        accessType = "global";
      }


      projectIds.sort((a, b) => a - b);


      return {
        id: user.id,
        employee_id: user.employee_id,
        name: user.name,

        role,

        team_lead_id:
          user.team_lead_id,

        project_ids: projectIds,

        editable,
        accessType,
      };
    });


    return res.status(200).json({
      success: true,

      projects,

      users: matrixUsers,
    });

  } catch (error) {
    console.error(
      "Get Assignment Matrix Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load assignment matrix",
      error: error.message,
    });
  }
};


// ============================================================
// 2. SAVE ASSIGNMENT MATRIX
// ============================================================

const saveAssignmentMatrix = async (
  req,
  res
) => {
  let connection;
  let transactionStarted = false;

  try {
    const { assignments } = req.body || {};

    if (!Array.isArray(assignments)) {
      return res.status(400).json({
        success: false,
        message:
          "assignments must be an array",
      });
    }

    const userIds = assignments.map(
      (item) => Number(item.userId)
    );

    if (
      new Set(userIds).size !==
      userIds.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Duplicate users found in assignment request",
      });
    }

    const [projectRows] = await db.query(`
      SELECT project_id
      FROM project
    `);

    const validProjectIds = new Set(
      projectRows.map(
        (project) =>
          Number(project.project_id)
      )
    );

    for (const assignment of assignments) {
      const userId = Number(
        assignment.userId
      );

      const projectIds =
        assignment.projectIds;

      if (
        !Number.isInteger(userId) ||
        !Array.isArray(projectIds)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Each assignment requires userId and projectIds array",
        });
      }

      const [userRows] = await db.query(
        `
        SELECT
          u.user_id,
          r.code AS role

        FROM users u

        INNER JOIN role r
          ON r.role_id = u.role_id

        WHERE u.user_id = ?
          AND u.status = 'active'

        LIMIT 1
        `,
        [userId]
      );

      if (userRows.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            `User ${userId} is invalid or inactive`,
        });
      }

      if (normalizeRoleCode(userRows[0].role) !== "indexer") {
        return res.status(403).json({
          success: false,
          message:
            `Assignments for user ${userId} cannot be changed from Assignment Matrix`,
        });
      }

      const uniqueProjectIds = [
        ...new Set(
          projectIds
            .map(Number)
            .filter((projectId) => Number.isInteger(projectId) && projectId > 0)
        ),
      ];

      for (const projectId of uniqueProjectIds) {
        if (!validProjectIds.has(projectId)) {
          return res.status(400).json({
            success: false,
            message:
              `Invalid project ID: ${projectId}`,
          });
        }
      }
    }

    connection =
      await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    for (const assignment of assignments) {
      const userId =
        Number(assignment.userId);

      const projectIds = [
        ...new Set(
          assignment.projectIds
            .map(Number)
            .filter((projectId) => Number.isInteger(projectId) && projectId > 0)
        ),
      ];

      await connection.query(
        `
        DELETE FROM project_assignment
        WHERE user_id = ?
        `,
        [userId]
      );

      for (const projectId of projectIds) {
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
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message:
        "Project assignments updated successfully",
    });

  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Save assignment matrix rollback error:",
          rollbackError
        );
      }
    }

    console.error(
      "Save Assignment Matrix Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update project assignments",
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
  getAssignmentMatrix,
  saveAssignmentMatrix,
};