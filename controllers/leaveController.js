const db = require("../config/db");

// Creates a leave request for the logged-in user
// Creates a leave request and notifies the Team Lead
const createLeaveRequest = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      leaveType,
      startDate,
      endDate,
      reason,
    } = req.body;

    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({
        success: false,
        message:
          "Leave type, start date, end date and reason are required",
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    // Saves leave request as PENDING
    const [result] = await db.query(
      `
      INSERT INTO leave_requests
      (
        user_id,
        leave_type,
        start_date,
        end_date,
        reason,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'PENDING')
      `,
      [
        userId,
        leaveType,
        startDate,
        endDate,
        reason,
      ]
    );

    // Finds the Team Lead of the logged-in employee
    const [teamLeadRows] = await db.query(
      `
      SELECT team_lead_id
      FROM team_members
      WHERE member_id = ?
      LIMIT 1
      `,
      [userId]
    );

    // Creates an unread notification for the Team Lead
    if (teamLeadRows.length > 0) {
      const teamLeadId = teamLeadRows[0].team_lead_id;

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
          teamLeadId,
          "GENERAL",
          "New leave request",
          "A team member has submitted a new leave request.",
        ]
      );
    }

    return res.status(201).json({
      success: true,
      message: "Leave request submitted successfully",
      leaveRequestId: result.insertId,
    });
  } catch (error) {
    console.error("Create Leave Request Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit leave request",
      error: error.message,
    });
  }
};


// Gets leave requests created by the logged-in user
const getMyLeaveRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const [requests] = await db.query(
      `
      SELECT
        id,
        leave_type,
        start_date,
        end_date,
        reason,
        status,
        review_comment,
        reviewed_at,
        created_at
      FROM leave_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("Get Leave Requests Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load leave requests",
      error: error.message,
    });
  }
};

module.exports = {
  createLeaveRequest,
  getMyLeaveRequests,
};