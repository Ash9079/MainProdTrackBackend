const db = require("../../config/db");

// Gets pending correction requests from the Team Lead's team
const getPendingApprovals = async (req, res) => {
  try {
    const teamLeadId = req.user.id;

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

        u.id AS employee_id,
        u.employee_id AS employee_code,
        u.name AS employee_name,

        p.id AS project_id,
        p.project_name

      FROM correction_requests cr

      JOIN team_members tm
        ON tm.member_id = cr.user_id

      JOIN users u
        ON u.id = cr.user_id

      JOIN projects p
        ON p.id = cr.project_id

      WHERE tm.team_lead_id = ?
        AND cr.status = 'PENDING'

      ORDER BY cr.created_at DESC
      `,
      [teamLeadId]
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("Get Pending Approvals Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load pending approvals",
      error: error.message,
    });
  }
};


// Approves a correction request and notifies the Indexer
const approveCorrectionRequest = async (req, res) => {
  try {
    const teamLeadId = req.user.id;
    const requestId = req.params.id;

    const { reviewComment } = req.body;

    // Checks whether this request belongs to this Team Lead's team
    const [requests] = await db.query(
      `
      SELECT
        cr.id,
        cr.user_id,
        cr.status
      FROM correction_requests cr

      JOIN team_members tm
        ON tm.member_id = cr.user_id

      WHERE cr.id = ?
        AND tm.team_lead_id = ?

      LIMIT 1
      `,
      [requestId, teamLeadId]
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Correction request not found",
      });
    }

    if (requests[0].status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Correction request has already been reviewed",
      });
    }

    // Updates correction request status
    await db.query(
      `
      UPDATE correction_requests
      SET
        status = 'APPROVED',
        reviewed_by = ?,
        reviewed_at = NOW(),
        review_comment = ?
      WHERE id = ?
      `,
      [
        teamLeadId,
        reviewComment || null,
        requestId,
      ]
    );

    const indexerId = requests[0].user_id;

    // Creates notification automatically for the Indexer
    await db.query(
      `
      INSERT INTO notifications
      (
        user_id,
        type,
        title,
        message,
        is_read
      )
      VALUES (?, ?, ?, ?, 0)
      `,
      [
        indexerId,
        "CORRECTION",
        "Correction approved",
        "Your correction request has been approved by your Team Lead.",
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Correction request approved successfully",
    });
  } catch (error) {
    console.error("Approve Correction Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve correction request",
      error: error.message,
    });
  }
};


// Rejects a correction request and notifies the Indexer
const rejectCorrectionRequest = async (req, res) => {
  try {
    const teamLeadId = req.user.id;
    const requestId = req.params.id;

    const { reviewComment } = req.body;

    // Checks whether this request belongs to this Team Lead's team
    const [requests] = await db.query(
      `
      SELECT
        cr.id,
        cr.user_id,
        cr.status
      FROM correction_requests cr

      JOIN team_members tm
        ON tm.member_id = cr.user_id

      WHERE cr.id = ?
        AND tm.team_lead_id = ?

      LIMIT 1
      `,
      [requestId, teamLeadId]
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Correction request not found",
      });
    }

    if (requests[0].status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Correction request has already been reviewed",
      });
    }

    // Updates correction request status
    await db.query(
      `
      UPDATE correction_requests
      SET
        status = 'REJECTED',
        reviewed_by = ?,
        reviewed_at = NOW(),
        review_comment = ?
      WHERE id = ?
      `,
      [
        teamLeadId,
        reviewComment || null,
        requestId,
      ]
    );

    const indexerId = requests[0].user_id;

    // Creates notification automatically for the Indexer
    await db.query(
      `
      INSERT INTO notifications
      (
        user_id,
        type,
        title,
        message,
        is_read
      )
      VALUES (?, ?, ?, ?, 0)
      `,
      [
        indexerId,
        "CORRECTION",
        "Correction rejected",
        "Your correction request has been rejected by your Team Lead.",
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Correction request rejected successfully",
    });
  } catch (error) {
    console.error("Reject Correction Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject correction request",
      error: error.message,
    });
  }
};


module.exports = {
  getPendingApprovals,
  approveCorrectionRequest,
  rejectCorrectionRequest,
};