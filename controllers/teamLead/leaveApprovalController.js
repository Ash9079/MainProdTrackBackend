const db = require("../../config/db");
const { sendError } = require("../../utils/httpError");

const getPendingLeaveRequests = async (req, res) => {
  try {
    const teamLeadId = req.user.id;

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
      [teamLeadId, teamLeadId],
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    return sendError(res, error, {
      context: "GET /team-lead/leave-requests",
      message: "Failed to load pending leave requests",
    });
  }
};

const approveLeaveRequest = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const teamLeadId = req.user.id;
    const leaveRequestId = Number(req.params.id);
    const { reviewComment = "" } = req.body || {};

    if (!Number.isSafeInteger(leaveRequestId) || leaveRequestId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid leave request ID is required",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

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
      `,
      [leaveRequestId, teamLeadId, teamLeadId],
    );

    if (requests.length === 0) {
      reject(404, "Leave request not found or cannot be approved");
    }

    const request = requests[0];

    if (request.status !== "PENDING") {
      reject(409, "Leave request has already been reviewed");
    }

    const leaveType = String(request.leave_type || "").trim();
    const leaveTypeKey = leaveType.toLowerCase().replace(/\s+/g, "_");

    const [attendanceStatuses] = await connection.query(
      `
        SELECT status_id
        FROM attendance_status
        WHERE is_leave = 1
          AND (
            code = ?
            OR name = ?
            OR LOWER(REPLACE(code, ' ', '_')) = ?
            OR LOWER(REPLACE(name, ' ', '_')) = ?
          )
        LIMIT 1
        `,
      [leaveType, leaveType, leaveTypeKey, leaveTypeKey],
    );

    if (attendanceStatuses.length === 0) {
      reject(400, "Attendance leave status is not configured");
    }

    const startDate = new Date(`${request.start_date}T00:00:00Z`);
    const endDate = new Date(`${request.end_date}T00:00:00Z`);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      reject(400, "Leave request has invalid dates");
    }

    const leaveDates = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      leaveDates.push(currentDate.toISOString().slice(0, 10));
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);

      if (leaveDates.length > 366) {
        reject(400, "Leave duration cannot exceed 366 days");
      }
    }

    const leaveStatusId = attendanceStatuses[0].status_id;

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
        ],
      );
    }

    const [updateResult] = await connection.query(
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
      [String(reviewComment || "").trim() || null, teamLeadId, leaveRequestId],
    );

    if (updateResult.affectedRows !== 1) {
      reject(409, "Leave request changed. Refresh and try again");
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
      ],
    );

    await connection.query(
      `
      INSERT INTO notification
      (
        user_id,
        title,
        body,
        is_read
      )
      VALUES (?, ?, ?, 0)
      `,
      [
        request.user_id,
        "Leave request approved",
        "Your leave request has been approved by your Team Lead.",
      ],
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: "Leave request approved and attendance updated successfully",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Approve leave rollback error:", rollbackError);
      }
    }

    if (error.httpStatus) {
      return res.status(error.httpStatus).json({
        success: false,
        message: error.message,
      });
    }

    return sendError(res, error, {
      context: "POST /team-lead/leave-requests/:id/approve",
      message: "Failed to approve leave request",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const rejectLeaveRequest = async (req, res) => {
  try {
    const teamLeadId = req.user.id;
    const leaveRequestId = req.params.id;
    const { reviewComment } = req.body || {};

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
      [leaveRequestId, teamLeadId],
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    if (requests[0].status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Leave request has already been reviewed",
      });
    }

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
      [reviewComment || null, teamLeadId, leaveRequestId],
    );

    await db.query(
      `
      INSERT INTO notification
      (
        user_id,
        title,
        body,
        is_read
      )
      VALUES (?, ?, ?, 0)
      `,
      [
        requests[0].user_id,
        "Leave request rejected",
        "Your leave request has been rejected by your Team Lead.",
      ],
    );

    return res.status(200).json({
      success: true,
      message: "Leave request rejected successfully",
    });
  } catch (error) {
    return sendError(res, error, {
      context: "POST /team-lead/leave-requests/:id/reject",
      message: "Failed to reject leave request",
    });
  }
};

module.exports = {
  getPendingLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
};
