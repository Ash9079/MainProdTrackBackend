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
    lr.leave_request_id AS id,
    lr.leave_request_id,
    lr.leave_type,

    DATE_FORMAT(
      lr.start_date,
      '%Y-%m-%d'
    ) AS start_date,

    DATE_FORMAT(
      lr.end_date,
      '%Y-%m-%d'
    ) AS end_date,

    lr.reason,
    lr.status,
    lr.created_at,

    u.user_id,
    u.emp_code AS employee_id,
    u.full_name AS employee_name

  FROM leave_request lr

  JOIN users u
    ON u.user_id = lr.user_id

  WHERE u.team_lead_id = ?
  AND lr.user_id <> ?
  AND lr.status = 'PENDING'
    AND u.status = 'active'

  ORDER BY
    lr.created_at DESC,
    lr.leave_request_id DESC
  `,
  [teamLeadId, teamLeadId]
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
  let connection;

  try {
    const teamLeadId = req.user.id;
    const leaveRequestId = Number(req.params.id);
    const { reviewComment = "" } = req.body || {};

    if (
      !Number.isSafeInteger(leaveRequestId) ||
      leaveRequestId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid leave request ID is required",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const reject = (httpStatus, message) => {
      throw Object.assign(new Error(message), {
        httpStatus,
      });
    };

    const [requests] = await connection.query(
      `
      SELECT
        lr.leave_request_id,
        lr.user_id,
        lr.leave_type,
        DATE_FORMAT(
          lr.start_date,
          '%Y-%m-%d'
        ) AS start_date,
        DATE_FORMAT(
          lr.end_date,
          '%Y-%m-%d'
        ) AS end_date,
        lr.status

      FROM leave_request lr

      JOIN users u
        ON u.user_id = lr.user_id

      WHERE lr.leave_request_id = ?
        AND u.team_lead_id = ?
        AND lr.user_id <> ?
        AND u.status = 'active'

      LIMIT 1
      FOR UPDATE
      `,
      [
        leaveRequestId,
        teamLeadId,
        teamLeadId,
      ]
    );

    if (requests.length === 0) {
      reject(
        404,
        "Leave request not found or cannot be approved"
      );
    }

    const request = requests[0];

    if (request.status !== "PENDING") {
      reject(
        409,
        "Leave request has already been reviewed"
      );
    }

    const [attendanceStatuses] =
      await connection.query(
        `
        SELECT status_id
        FROM attendance_status
        WHERE is_leave = 1
          AND (
            code = ?
            OR name = ?
          )
        LIMIT 1
        `,
        [
          request.leave_type,
          request.leave_type,
        ]
      );

    if (attendanceStatuses.length === 0) {
      reject(
        400,
        "Attendance leave status is not configured"
      );
    }

    const startDate = new Date(
      `${request.start_date}T00:00:00Z`
    );

    const endDate = new Date(
      `${request.end_date}T00:00:00Z`
    );

    const leaveDates = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      leaveDates.push(
        currentDate.toISOString().slice(0, 10)
      );

      currentDate.setUTCDate(
        currentDate.getUTCDate() + 1
      );

      if (leaveDates.length > 366) {
        reject(
          400,
          "Leave duration cannot exceed 366 days"
        );
      }
    }

    const leaveStatusId =
      attendanceStatuses[0].status_id;

    for (const attendanceDate of leaveDates) {
      await connection.query(
        `
        INSERT INTO attendance
        (
          user_id,
          att_date,
          status_id,
          hours,
          note,
          approved_by
        )
        VALUES (?, ?, ?, 0, ?, ?)

        ON DUPLICATE KEY UPDATE
          status_id = VALUES(status_id),
          hours = 0,
          note = VALUES(note),
          approved_by = VALUES(approved_by)
        `,
        [
          request.user_id,
          attendanceDate,
          leaveStatusId,
          `Approved ${request.leave_type}`,
          teamLeadId,
        ]
      );
    }

    const [updateResult] =
      await connection.query(
        `
        UPDATE leave_request
        SET
          status = 'APPROVED',
          review_comment = ?,
          reviewed_by = ?,
          reviewed_at = NOW()
        WHERE leave_request_id = ?
          AND status = 'PENDING'
        `,
        [
          reviewComment.trim() || null,
          teamLeadId,
          leaveRequestId,
        ]
      );

    if (updateResult.affectedRows !== 1) {
      reject(
        409,
        "Leave request changed. Refresh and try again"
      );
    }

    await connection.query(
      `
      INSERT INTO audit_log
      (
        user_id,
        action,
        entity_type,
        entity_ref,
        detail
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        teamLeadId,
        "Approved leave request",
        "leave_request",
        String(leaveRequestId),
        `Approved leave for user ${request.user_id} from ${request.start_date} to ${request.end_date}`,
      ]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message:
        "Leave request approved and attendance updated successfully",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(
      "Approve Leave Request Error:",
      error
    );

    return res
      .status(error.httpStatus || 500)
      .json({
        success: false,
        message: error.httpStatus
          ? error.message
          : "Failed to approve leave request",
      });
  } finally {
    if (connection) {
      connection.release();
    }
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
        lr.leave_request_id,
        lr.user_id,
        lr.status

      FROM leave_request lr

      JOIN users u
        ON u.user_id = lr.user_id

      WHERE lr.leave_request_id = ?
        AND u.team_lead_id = ?
        AND u.status = 'active'

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
      UPDATE leave_request
      SET
        status = 'REJECTED',
        review_comment = ?,
        reviewed_by = ?,
        reviewed_at = NOW()
      WHERE leave_request_id = ?
        AND status = 'PENDING'
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