const db = require("../config/db");

const getPendingRequiredGuides = async (
  executor,
  userId,
  projectId
) => {
  const [guides] = await executor.query(
    `
    SELECT
      gv.version_id,
      g.title,
      gv.version_label
    FROM guide g
    JOIN guide_version gv
      ON gv.guide_id = g.guide_id
    WHERE g.project_id = ?
      AND gv.is_latest = 1
      AND gv.requires_ack = 1
      AND NOT EXISTS (
        SELECT 1
        FROM guide_acknowledgement ga
        WHERE ga.version_id = gv.version_id
          AND ga.user_id = ?
          AND ga.status = 'read'
      )
    `,
    [projectId, userId]
  );

  return guides;
};

const createEntry = async (req, res) => {
  try {
    const {
      projectId,
      productionDate,
      batchJobId,
      reportingCategory,
      documentsReceived,
      documentsCompleted,
      batchesProcessed,
      errorsFlagged,
      notes,
      status,
    } = req.body;

    if (!projectId || !productionDate) {
      return res.status(400).json({
        success: false,
        message: "Project and production date are required",
      });
    }

    const received = Number(documentsReceived || 0);
    const completed = Number(documentsCompleted || 0);

    if (completed > received) {
      return res.status(400).json({
        success: false,
        message: "Completed documents cannot exceed received documents",
      });
    }

    const [assignments] = await db.query(
      `
      SELECT assignment_id
      FROM project_assignment
      WHERE user_id = ?
        AND project_id = ?
      LIMIT 1
      `,
      [req.user.id, projectId]
    );

    if (assignments.length === 0) {
      return res.status(403).json({
        success: false,
        message: "This project is not assigned to you",
      });
    }

    let categoryId = null;

    if (reportingCategory) {
      if (!Number.isNaN(Number(reportingCategory))) {
        categoryId = Number(reportingCategory);
      } else {
        const [categories] = await db.query(
          `
          SELECT category_id
          FROM reporting_category
          WHERE name = ?
          LIMIT 1
          `,
          [reportingCategory]
        );

        categoryId =
          categories.length > 0
            ? categories[0].category_id
            : null;
      }
    }

    const statusCode = String(status || "draft").toLowerCase();
    if (!["draft", "submitted"].includes(statusCode)) {
      return res.status(400).json({
        success: false,
        message: "You can only create draft or submitted entries",
      });
    }

    if (statusCode === "submitted") {
  const pendingGuides = await getPendingRequiredGuides(
    db,
    req.user.id,
    projectId
  );

  if (pendingGuides.length > 0) {
    return res.status(409).json({
      success: false,
      message:
        "Please acknowledge the required indexing guides for this project before submitting.",
      pendingGuides,
    });
  }
}

    const [statuses] = await db.query(
      `
      SELECT status_id, code
      FROM entry_status
      WHERE code = ?
      LIMIT 1
      `,
      [statusCode]
    );

    if (statuses.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid entry status",
      });
    }

    const selectedStatus = statuses[0];

    const [result] = await db.query(
      `
      INSERT INTO daily_entry
      (
        project_id,
        user_id,
        production_date,
        batch_ref,
        category_id,
        docs_received,
        docs_completed,
        batches_processed,
        errors_flagged,
        remarks,
        status_id,
        submitted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        projectId,
        req.user.id,
        productionDate,
        batchJobId || null,
        categoryId,
        received,
        completed,
        Number(batchesProcessed || 0),
        Number(errorsFlagged || 0),
        notes || null,
        selectedStatus.status_id,
        selectedStatus.code === "submitted"
          ? new Date()
          : null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Daily entry created successfully",
      entryId: result.insertId,
    });
  } catch (error) {
    console.error("Create Daily Entry Error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message:
          "An entry already exists for this project, date and batch",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create daily entry",
      error: error.message,
    });
  }
};

const getMyEntries = async (req, res) => {
  try {
    const [entries] = await db.query(
      `
      SELECT
        de.entry_id AS id,
        de.entry_id,
        DATE_FORMAT(de.production_date, '%Y-%m-%d') AS production_date,
        de.batch_ref AS batch_job_id,
        de.batch_ref,
        rc.name AS reporting_category,

        de.docs_received AS documents_received,
        de.docs_completed AS documents_completed,
        de.batches_processed,
        de.errors_flagged,
        de.remarks AS notes,

        es.code AS status,
        es.name AS status_name,

        p.project_id,
        p.project_code,
        p.project_name,

        de.submitted_at,
        de.reviewed_at,
        de.locked_at,
        de.created_at,
        de.modified_at

      FROM daily_entry de

      JOIN project p
        ON p.project_id = de.project_id

      JOIN entry_status es
        ON es.status_id = de.status_id

      LEFT JOIN reporting_category rc
        ON rc.category_id = de.category_id

      WHERE de.user_id = ?

      ORDER BY
        de.production_date DESC,
        de.entry_id DESC
      `,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      count: entries.length,
      entries,
    });
  } catch (error) {
    console.error("Get Daily Entries Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load daily entries",
      error: error.message,
    });
  }
};
const updateEntry = async (req, res) => {
  let connection;

  try {
    const entryId = Number(req.params.id);
    const userId = req.user.id;

    const {
      projectId,
      productionDate,
      batchJobId,
      documentsReceived,
      documentsCompleted,
      batchesProcessed,
      errorsFlagged,
      notes,
      status = "draft",
    } = req.body;

    const selectedProjectId = Number(projectId);
    const statusCode = String(status).toLowerCase();

    const numbers = [
      documentsReceived,
      documentsCompleted,
      batchesProcessed,
      errorsFlagged,
    ].map((value) => Number(value ?? 0));

    const validDate =
      typeof productionDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(productionDate) &&
      Number.isFinite(Date.parse(productionDate)) &&
      new Date(productionDate).toISOString().slice(0, 10) ===
        productionDate;

    if (
      !Number.isSafeInteger(entryId) ||
      entryId <= 0 ||
      !Number.isSafeInteger(selectedProjectId) ||
      selectedProjectId <= 0 ||
      !validDate
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid entry ID, project and date are required",
      });
    }

    if (
      numbers.some(
        (value) =>
          !Number.isInteger(value) ||
          value < 0 ||
          value > 4294967295
      ) ||
      numbers[1] > numbers[0]
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Use valid non-negative whole numbers. Completed cannot exceed received.",
      });
    }

    if (!["draft", "submitted"].includes(statusCode)) {
      return res.status(400).json({
        success: false,
        message: "A draft can only be saved or submitted",
      });
    }

    const batchRef = String(batchJobId ?? "").trim();
    const remarks = String(notes ?? "").trim();

    if (batchRef.length > 60 || remarks.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Batch ID allows 60 characters; notes allow 500",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const reject = (httpStatus, message) => {
      throw Object.assign(new Error(message), { httpStatus });
    };

    // Lock the record while checking and updating it.
    const [entries] = await connection.query(
      `
      SELECT de.entry_id, de.status_id, de.locked_at,
             es.code AS status
      FROM daily_entry de
      JOIN entry_status es ON es.status_id = de.status_id
      WHERE de.entry_id = ? AND de.user_id = ?
      FOR UPDATE
      `,
      [entryId, userId]
    );

    if (!entries.length) {
      reject(404, "Entry not found");
    }

    const entry = entries[0];

    if (entry.status !== "draft" || entry.locked_at !== null) {
      reject(409, "Only an unlocked draft can be edited");
    }

    // Verify assignment and derive the category from the project.
    const [projects] = await connection.query(
      `
      SELECT p.category_id
      FROM project_assignment pa
      JOIN project p ON p.project_id = pa.project_id
      WHERE pa.user_id = ?
        AND pa.project_id = ?
        AND p.status = 'active'
      `,
      [userId, selectedProjectId]
    );

    if (!projects.length) {
      reject(403, "This active project is not assigned to you");
    }

    if (statusCode === "submitted") {
      const pendingGuides = await getPendingRequiredGuides(
        connection,
        userId,
        selectedProjectId
      );

      if (pendingGuides.length > 0) {
        reject(
          409,
          "Please acknowledge the required indexing guides for this project before submitting."
        );
      }
    }

    const [statuses] = await connection.query(
      "SELECT status_id FROM entry_status WHERE code = ?",
      [statusCode]
    );

    if (!statuses.length) {
      reject(400, "Entry status is not configured");
    }

    await connection.query(
      `
      UPDATE daily_entry
      SET project_id = ?,
          production_date = ?,
          batch_ref = ?,
          category_id = ?,
          docs_received = ?,
          docs_completed = ?,
          batches_processed = ?,
          errors_flagged = ?,
          remarks = ?,
          status_id = ?,
          submitted_at = ?
      WHERE entry_id = ? AND user_id = ?
      `,
      [
        selectedProjectId,
        productionDate,
        batchRef || null,
        projects[0].category_id,
        ...numbers,
        remarks || null,
        statuses[0].status_id,
        statusCode === "submitted" ? new Date() : null,
        entryId,
        userId,
      ]
    );

    await connection.query(
      `
      INSERT INTO audit_log
        (user_id, action, entity_type, entity_ref, detail)
      VALUES (?, ?, 'daily_entry', ?, ?)
      `,
      [
        userId,
        statusCode === "submitted"
          ? "Submitted draft"
          : "Updated draft",
        String(entryId),
        `Entry ${entryId} saved with status ${statusCode}`,
      ]
    );

    await connection.commit();

    return res.json({
      success: true,
      message:
        statusCode === "submitted"
          ? "Draft submitted successfully"
          : "Draft updated successfully",
      entryId,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Update Daily Entry Error:", error);

    return res.status(
      error.code === "ER_DUP_ENTRY"
        ? 409
        : error.httpStatus || 500
    ).json({
      success: false,
      message:
        error.code === "ER_DUP_ENTRY"
          ? "An entry already exists for this project, date and batch"
          : error.httpStatus
            ? error.message
            : "Failed to update daily entry",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const getPendingTeamEntries = async (req, res) => {
  try {
    const teamLeadId = req.user.id;

    const [entries] = await db.query(
      `
      SELECT
        de.entry_id AS id,
        de.entry_id,
        DATE_FORMAT(
          de.production_date, '%Y-%m-%d'
        ) AS production_date,
        de.batch_ref AS batch_job_id,

        u.user_id AS employee_id,
        u.emp_code AS employee_code,
        u.full_name AS employee_name,

        p.project_id,
        p.project_name,
        rc.name AS reporting_category,

        de.docs_received AS documents_received,
        de.docs_completed AS documents_completed,
        de.batches_processed,
        de.errors_flagged,
        de.remarks AS notes,

        es.code AS status,
        de.submitted_at

      FROM daily_entry de

      JOIN users u
        ON u.user_id = de.user_id

      JOIN project p
        ON p.project_id = de.project_id

      JOIN entry_status es
        ON es.status_id = de.status_id

      LEFT JOIN reporting_category rc
        ON rc.category_id = de.category_id

      WHERE u.team_lead_id = ?
        AND de.user_id <> ?
        AND es.code = 'submitted'
        AND de.locked_at IS NULL

        AND EXISTS (
          SELECT 1
          FROM project_assignment pa
          WHERE pa.project_id = de.project_id
            AND pa.user_id = ?
        )

      ORDER BY de.submitted_at ASC, de.entry_id ASC
      `,
      [teamLeadId, teamLeadId, teamLeadId]
    );

    return res.status(200).json({
      success: true,
      count: entries.length,
      entries,
    });
  } catch (error) {
    console.error("Get Pending Team Entries Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load submitted team entries",
    });
  }
};

const reviewEntry = async (req, res) => {
  let connection;

  try {
    const teamLeadId = req.user.id;
    const entryId = Number(req.params.id);

    if (req.user.role !== "teamLead") {
      return res.status(403).json({
        success: false,
        message: "Only Team Leads can review entries",
      });
    }

    if (!Number.isSafeInteger(entryId) || entryId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid entry ID is required",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const reject = (httpStatus, message) => {
      throw Object.assign(new Error(message), { httpStatus });
    };

    // Lock the entry and check the same access rules as the pending list.
    const [entries] = await connection.query(
      `
      SELECT
        de.entry_id,
        de.status_id,
        de.locked_at,
        es.code AS status
      FROM daily_entry de

      JOIN users u
        ON u.user_id = de.user_id

      JOIN entry_status es
        ON es.status_id = de.status_id

      WHERE de.entry_id = ?
        AND u.team_lead_id = ?
        AND de.user_id <> ?

        AND EXISTS (
          SELECT 1
          FROM project_assignment pa
          WHERE pa.project_id = de.project_id
            AND pa.user_id = ?
        )

      FOR UPDATE
      `,
      [entryId, teamLeadId, teamLeadId, teamLeadId]
    );

    if (entries.length === 0) {
      reject(404, "Team entry not found or not accessible");
    }

    const entry = entries[0];

    if (entry.status !== "submitted" || entry.locked_at !== null) {
      reject(409, "Only an unlocked submitted entry can be reviewed");
    }

    const [statuses] = await connection.query(
      `
      SELECT status_id
      FROM entry_status
      WHERE code = 'reviewed'
      LIMIT 1
      `
    );

    if (statuses.length === 0) {
      reject(500, "Reviewed status is not configured");
    }

    const [result] = await connection.query(
      `
      UPDATE daily_entry
      SET status_id = ?,
          reviewed_by = ?,
          reviewed_at = NOW()
      WHERE entry_id = ?
        AND status_id = ?
        AND locked_at IS NULL
      `,
      [
        statuses[0].status_id,
        teamLeadId,
        entryId,
        entry.status_id,
      ]
    );

    if (result.affectedRows !== 1) {
      reject(409, "Entry changed. Refresh the list and try again");
    }

    await connection.query(
      `
      INSERT INTO audit_log
        (user_id, action, entity_type, entity_ref, detail)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        teamLeadId,
        "Reviewed daily entry",
        "daily_entry",
        String(entryId),
        "Status changed from submitted to reviewed",
      ]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Daily entry reviewed successfully",
      entryId,
      status: "reviewed",
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Review rollback error:", rollbackError);
      }
    }

    console.error("Review Entry Error:", error);

    return res.status(error.httpStatus || 500).json({
      success: false,
      message: error.httpStatus
        ? error.message
        : "Failed to review daily entry",
    });
  } finally {
    if (connection) connection.release();
  }
};
module.exports = {
  createEntry,
  getMyEntries,
  updateEntry,
  getPendingTeamEntries,
  reviewEntry,
};