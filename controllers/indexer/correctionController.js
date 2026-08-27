const db = require("../../config/db");

// Creates a new correction request for the logged-in Indexer
const createCorrectionRequest = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      projectId,
      dailyEntryId,
      productionDate,
      fieldName,
      oldValue,
      newValue,
      reason,
    } = req.body;

    // Checks required fields
    if (!projectId || !productionDate || !fieldName || !newValue) {
      return res.status(400).json({
        success: false,
        message:
          "Project, production date, field name and new value are required",
      });
    }

    // Checks whether the project is assigned to this Indexer
    const [assignment] = await db.query(
      `
      SELECT id
      FROM user_project_assignments
      WHERE user_id = ? AND project_id = ?
      LIMIT 1
      `,
      [userId, projectId]
    );

    if (assignment.length === 0) {
      return res.status(403).json({
        success: false,
        message: "This project is not assigned to you",
      });
    }

    // Saves the correction request with PENDING status
    const [result] = await db.query(
      `
      INSERT INTO correction_requests
      (
        user_id,
        project_id,
        daily_entry_id,
        production_date,
        field_name,
        old_value,
        new_value,
        reason,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `,
      [
        userId,
        projectId,
        dailyEntryId || null,
        productionDate,
        fieldName,
        oldValue || null,
        newValue,
        reason || null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Correction request submitted successfully",
      correctionRequestId: result.insertId,
    });
  } catch (error) {
    console.error("Create Correction Request Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create correction request",
      error: error.message,
    });
  }
};

// Gets all correction requests created by the logged-in Indexer
const getMyCorrectionRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const [requests] = await db.query(
      `
      SELECT
        cr.id,
        cr.production_date,
        cr.field_name,
        cr.old_value,
        cr.new_value,
        cr.reason,
        cr.status,
        cr.review_comment,
        cr.created_at,
        p.id AS project_id,
        p.project_name

      FROM correction_requests cr

      JOIN projects p
        ON p.id = cr.project_id

      WHERE cr.user_id = ?

      ORDER BY cr.created_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("Get Correction Requests Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load correction requests",
      error: error.message,
    });
  }
};

module.exports = {
  createCorrectionRequest,
  getMyCorrectionRequests,
};