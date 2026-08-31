const db = require("../config/db");

const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

// Creates a pending leave request
const createLeaveRequest = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const userId = req.user.id;

    const {
      leaveType,
      startDate,
      endDate,
      reason,
    } = req.body || {};

    if (
      typeof leaveType !== "string" ||
      !leaveType.trim() ||
      typeof reason !== "string" ||
      !reason.trim() ||
      !validDate(startDate) ||
      !validDate(endDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "Leave type, valid dates and reason are required",
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    if (reason.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: "Reason cannot exceed 500 characters",
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

    // Validate leave type using attendance status settings
    const [types] = await connection.query(
      `
      SELECT name
      FROM attendance_status
      WHERE is_leave = 1
        AND (code = ? OR name = ?)
      LIMIT 1
      `,
      [leaveType.trim(), leaveType.trim()]
    );

    if (types.length === 0) {
      reject(400, "Invalid leave type");
    }

    // Find the employee and assigned Team Lead
    const [users] = await connection.query(
      `
      SELECT
        full_name,
        team_lead_id
      FROM users
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (users.length === 0) {
      reject(404, "User not found");
    }

    // Save request as pending
    const [result] = await connection.query(
      `
      INSERT INTO leave_request
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
        types[0].name,
        startDate,
        endDate,
        reason.trim(),
      ]
    );

    const teamLeadId = users[0].team_lead_id;

    // Notify Team Lead if one is assigned
    if (
      teamLeadId &&
      Number(teamLeadId) !== Number(userId)
    ) {
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
          teamLeadId,
          "New leave request",
          `${users[0].full_name} submitted leave request #${result.insertId} for ${startDate} to ${endDate}.`,
        ]
      );
    }

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Leave request submitted successfully",
      leaveRequestId: result.insertId,
      status: "PENDING",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Leave rollback error:",
          rollbackError
        );
      }
    }

    console.error(
      "Create Leave Request Error:",
      error
    );

    return res.status(error.httpStatus || 500).json({
      success: false,
      message: error.httpStatus
        ? error.message
        : "Failed to submit leave request",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Gets the logged-in user's leave requests
const getMyLeaveRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const [requests] = await db.query(
      `
      SELECT
        leave_request_id AS id,
        leave_request_id,
        leave_type,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
        reason,
        status,
        reviewed_by,
        review_comment,
        reviewed_at,
        created_at,
        modified_at
      FROM leave_request
      WHERE user_id = ?
      ORDER BY
        created_at DESC,
        leave_request_id DESC
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
      "Get Leave Requests Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load leave requests",
    });
  }
};

module.exports = {
  createLeaveRequest,
  getMyLeaveRequests,
};