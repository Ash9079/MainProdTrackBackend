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

    const [assignment] = await db.query(
      `
      SELECT id
      FROM user_project_assignments
      WHERE user_id = ? AND project_id = ?
      LIMIT 1
      `,
      [req.user.id, projectId]
    );

    if (assignment.length === 0) {
      return res.status(403).json({
        success: false,
        message: "This project is not assigned to you",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO daily_entries
      (
        user_id,
        project_id,
        production_date,
        batch_job_id,
        reporting_category,
        documents_received,
        documents_completed,
        batches_processed,
        errors_flagged,
        notes,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.id,
        projectId,
        productionDate,
        batchJobId || null,
        reportingCategory || null,
        documentsReceived || 0,
        documentsCompleted || 0,
        batchesProcessed || 0,
        errorsFlagged || 0,
        notes || null,
        status || "DRAFT",
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Daily entry created successfully",
      entryId: result.insertId,
    });
  } catch (error) {
    console.error("Create Daily Entry Error:", error);

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
        de.id,
        de.production_date,
        de.batch_job_id,
        de.reporting_category,
        de.documents_received,
        de.documents_completed,
        de.batches_processed,
        de.errors_flagged,
        de.notes,
        de.status,

        p.id AS project_id,
        p.project_name

      FROM daily_entries de

      JOIN projects p
        ON p.id = de.project_id

      WHERE de.user_id = ?

      ORDER BY
        de.production_date DESC,
        de.id DESC
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