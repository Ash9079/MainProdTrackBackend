// Imports the database connection.
const db = require("../../config/db");


// Gets all pending leave requests belonging to the Team Lead's team.
const getPendingLeaveRequests = async (req, res) => {
  try {
    // Gets the logged-in Team Lead's user ID from the JWT token.
    const teamLeadId = req.user.id;

    // Gets pending leave requests only from employees under this Team Lead.
    const [requests] = await db.query(
      `
      SELECT
        lr.id,
        lr.leave_type,
        lr.start_date,
        lr.end_date,
        lr.reason,
        lr.status,
        lr.created_at,

        u.id AS user_id,
        u.employee_id,
        u.name AS employee_name

      FROM leave_requests lr

      JOIN team_members tm
        ON tm.member_id = lr.user_id

      JOIN users u
        ON u.id = lr.user_id

      WHERE tm.team_lead_id = ?
        AND lr.status = 'PENDING'

      ORDER BY lr.created_at DESC
      `,
      [teamLeadId]
    );

    // Returns all pending leave requests to the Team Lead.
    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });

  } catch (error) {
    // Logs the actual database/server error in the backend terminal.
    console.error("Get Pending Leave Requests Error:", error);

    // Returns an error response if pending leave requests cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load pending leave requests",
      error: error.message,
    });
  }
};


// Approves a pending leave request and notifies the employee.
const approveLeaveRequest = async (req, res) => {
  try {
    // Gets the logged-in Team Lead's ID.
    const teamLeadId = req.user.id;

    // Gets the leave request ID from the URL.
    const leaveRequestId = req.params.id;

    // Gets the optional review comment sent by the Team Lead.
    const { reviewComment } = req.body;

    // Checks that the leave belongs to an employee under this Team Lead.
    const [requests] = await db.query(
      `
      SELECT
        lr.id,
        lr.user_id,
        lr.status,
        lr.start_date,
        lr.end_date

      FROM leave_requests lr

      JOIN team_members tm
        ON tm.member_id = lr.user_id

      WHERE lr.id = ?
        AND tm.team_lead_id = ?

      LIMIT 1
      `,
      [leaveRequestId, teamLeadId]
    );

    // Stops if the leave request does not belong to this Team Lead.
    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    // Prevents an already reviewed leave request from being approved again.
    if (requests[0].status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Leave request has already been reviewed",
      });
    }

    // Changes the leave status from PENDING to APPROVED.
    await db.query(
      `
      UPDATE leave_requests
      SET
        status = 'APPROVED',
        review_comment = ?,
        reviewed_by = ?,
        reviewed_at = NOW()
      WHERE id = ?
      `,
      [
        reviewComment || null,
        teamLeadId,
        leaveRequestId,
      ]
    );

    // Creates an unread notification for the employee whose leave was approved.
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
        requests[0].user_id,
        "GENERAL",
        "Leave request approved",
        "Your leave request has been approved by your Team Lead.",
      ]
    );

    // Returns success after approving the leave and creating the notification.
    return res.status(200).json({
      success: true,
      message: "Leave request approved successfully",
    });

  } catch (error) {
    // Logs approval errors in the backend terminal.
    console.error("Approve Leave Request Error:", error);

    // Returns an error response if approval fails.
    return res.status(500).json({
      success: false,
      message: "Failed to approve leave request",
      error: error.message,
    });
  }
};


// Rejects a pending leave request and notifies the employee.
const rejectLeaveRequest = async (req, res) => {
  try {
    // Gets the logged-in Team Lead's ID.
    const teamLeadId = req.user.id;

    // Gets the leave request ID from the URL.
    const leaveRequestId = req.params.id;

    // Gets the optional rejection comment.
    const { reviewComment } = req.body;

    // Checks that the leave belongs to an employee under this Team Lead.
    const [requests] = await db.query(
      `
      SELECT
        lr.id,
        lr.user_id,
        lr.status

      FROM leave_requests lr

      JOIN team_members tm
        ON tm.member_id = lr.user_id

      WHERE lr.id = ?
        AND tm.team_lead_id = ?

      LIMIT 1
      `,
      [leaveRequestId, teamLeadId]
    );

    // Stops if the leave request cannot be found for this Team Lead.
    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    // Prevents an already reviewed leave request from being rejected again.
    if (requests[0].status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Leave request has already been reviewed",
      });
    }

    // Changes the leave request status from PENDING to REJECTED.
    await db.query(
      `
      UPDATE leave_requests
      SET
        status = 'REJECTED',
        review_comment = ?,
        reviewed_by = ?,
        reviewed_at = NOW()
      WHERE id = ?
      `,
      [
        reviewComment || null,
        teamLeadId,
        leaveRequestId,
      ]
    );

    // Creates an unread rejection notification for the employee.
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
        requests[0].user_id,
        "GENERAL",
        "Leave request rejected",
        "Your leave request has been rejected by your Team Lead.",
      ]
    );

    // Returns success after rejecting the leave request.
    return res.status(200).json({
      success: true,
      message: "Leave request rejected successfully",
    });

  } catch (error) {
    // Logs rejection errors in the backend terminal.
    console.error("Reject Leave Request Error:", error);

    // Returns an error response if rejection fails.
    return res.status(500).json({
      success: false,
      message: "Failed to reject leave request",
      error: error.message,
    });
  }
};


// Exports the controller functions so the routes can use them.
module.exports = {
  getPendingLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
};