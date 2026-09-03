const db = require("../../config/db");

// Creates a new correction request for the logged-in Indexer
const createCorrectionRequest = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      dailyEntryId,
      entryId,
      fieldName,
      oldValue,
      newValue,
      reason,
    } = req.body;

    const selectedEntryId = Number(
      dailyEntryId || entryId
    );

    if (
      !Number.isSafeInteger(selectedEntryId) ||
      selectedEntryId <= 0 ||
      !fieldName ||
      newValue === undefined ||
      newValue === null ||
      String(newValue).trim() === "" ||
      !reason
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Entry, field name, new value and reason are required",
      });
    }

    // Only the owner can request changes to a locked entry.
    const [entries] = await db.query(
      `
      SELECT
        de.entry_id,
        de.project_id,
        de.production_date
      FROM daily_entry de

      JOIN entry_status es
        ON es.status_id = de.status_id

      WHERE de.entry_id = ?
        AND de.user_id = ?
        AND es.code = 'locked'

      LIMIT 1
      `,
      [selectedEntryId, userId]
    );

    if (entries.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Locked daily entry not found or does not belong to you",
      });
    }

    const selectedEntry = entries[0];

    // Prevent duplicate pending requests for the same field.
    const [existing] = await db.query(
      `
      SELECT cr.request_id
      FROM correction_request cr

      JOIN correction_status cs
        ON cs.status_id = cr.status_id

      WHERE cr.entry_id = ?
        AND cr.field_name = ?
        AND cr.requested_by = ?
        AND cs.code = 'pending'

      LIMIT 1
      `,
      [
        selectedEntryId,
        fieldName,
        userId,
      ]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "A pending correction request already exists for this field",
      });
    }

    const [statuses] = await db.query(
      `
      SELECT status_id
      FROM correction_status
      WHERE code = 'pending'
      LIMIT 1
      `
    );

    if (statuses.length === 0) {
      return res.status(500).json({
        success: false,
        message:
          "Pending correction status is not configured",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO correction_request
      (
        entry_id,
        project_id,
        production_date,
        field_name,
        old_value,
        new_value,
        reason,
        requested_by,
        requested_at,
        status_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
      `,
      [
        selectedEntryId,
        selectedEntry.project_id,
        selectedEntry.production_date,
        fieldName,
        oldValue ?? null,
        String(newValue).trim(),
        String(reason).trim(),
        userId,
        statuses[0].status_id,
      ]
    );

    return res.status(201).json({
      success: true,
      message:
        "Correction request submitted successfully",
      correctionRequestId: result.insertId,
    });
  } catch (error) {
    console.error(
      "Create Correction Request Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to create correction request",
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
        cr.request_id AS id,
        cr.request_id,
        cr.entry_id,

        DATE_FORMAT(
          cr.production_date,
          '%Y-%m-%d'
        ) AS production_date,

        cr.field_name,
        cr.old_value,
        cr.new_value,
        cr.reason,

        cs.code AS status,
        cs.name AS status_name,

        cr.approver_comments AS review_comment,
        cr.requested_at AS created_at,
        cr.approved_at AS reviewed_at,

        p.project_id,
        p.project_name

      FROM correction_request cr

      JOIN correction_status cs
        ON cs.status_id = cr.status_id

      JOIN project p
        ON p.project_id = cr.project_id

      WHERE cr.requested_by = ?

      ORDER BY
        cr.requested_at DESC,
        cr.request_id DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error(
      "Get Correction Requests Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load correction requests",
      error: error.message,
    });
  }
};

// ======================================================
// GET LOCKED ENTRIES
// Returns the logged-in Indexer's locked daily entries
// so the correction form can populate the Project and
// Production Date dropdowns.
// ======================================================

const getLockedEntries = async (req, res) => {
  try {
    const userId = req.user.id;

    const [entries] = await db.query(
      `
      SELECT
        de.entry_id,
        p.project_id,
        p.project_name,
        DATE_FORMAT(de.production_date, '%Y-%m-%d') AS production_date

      FROM daily_entry de

      JOIN entry_status es
        ON es.status_id = de.status_id

      JOIN project p
        ON p.project_id = de.project_id

      WHERE de.user_id = ?
        AND es.code    = 'locked'

      ORDER BY de.production_date DESC, de.entry_id DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: entries.length,
      entries,
    });
  } catch (error) {
    console.error("Get Locked Entries Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load locked entries",
    });
  }
};

module.exports = {
  createCorrectionRequest,
  getMyCorrectionRequests,
  getLockedEntries,
};