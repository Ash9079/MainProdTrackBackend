const db = require("../config/db");

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
        de.production_date,
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

module.exports = {
  createEntry,
  getMyEntries,
};