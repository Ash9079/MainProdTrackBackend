const db = require("../config/db");

// Gets attendance records for the logged-in user
const getMyAttendance = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        a.attendance_id AS id,
        DATE_FORMAT(a.att_date, '%Y-%m-%d') AS attendance_date,
        DATE_FORMAT(a.att_date, '%a') AS day_name,
        ast.name AS status,
        ast.code AS status_code,
        a.hours,
        a.note
      FROM attendance a
      JOIN attendance_status ast
        ON ast.status_id = a.status_id
      WHERE a.user_id = ?
      ORDER BY a.att_date DESC, a.attendance_id DESC
      `,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      attendance: rows,
    });
  } catch (error) {
    console.error("Get Attendance Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load attendance",
      error: error.message,
    });
  }
};

// Gets attendance summary for the logged-in user
const getAttendanceSummary = async (req, res) => {
  try {
    const userId = req.user.id;

  const [rows] = await db.query(
    `
    SELECT
      COALESCE(SUM(ast.code = 'present'), 0) AS present_days,
      COALESCE(SUM(ast.is_leave = 1), 0) AS leave_days,
      COALESCE(SUM(ast.code = 'training'), 0) AS training_days,
      COALESCE(
        SUM(ast.counts_as_production_day = 1), 0
      ) AS working_days

    FROM attendance a

    JOIN attendance_status ast
      ON ast.status_id = a.status_id

    WHERE a.user_id = ?
    `,
    [userId]
  );

    return res.status(200).json({
      success: true,
      summary: rows[0],
    });
  } catch (error) {
    console.error("Attendance Summary Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load attendance summary",
      error: error.message,
    });
  }
};


// Team Lead marks attendance for a team member
const markAttendance = async (req, res) => {
  let connection;

  try {
    const teamLeadId = req.user.id;

    const {
      userId,
      statusCode,
      attendanceDate,
      hours,
      note,
    } = req.body || {};

    const employeeId = Number(userId);

    if (
      !Number.isSafeInteger(employeeId) ||
      employeeId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid employee ID is required",
      });
    }

    const normalizedStatus =
      String(statusCode || "")
        .trim()
        .toLowerCase();

    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: "Attendance status is required",
      });
    }

    if (
      attendanceDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(
        attendanceDate
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance date must be YYYY-MM-DD",
      });
    }

    if (
      note &&
      String(note).trim().length > 200
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance note cannot exceed 200 characters",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Employee must belong to logged-in Team Lead
    const [members] =
      await connection.query(
        `
        SELECT user_id, full_name
        FROM users
        WHERE user_id = ?
          AND team_lead_id = ?
          AND status = 'active'
        LIMIT 1
        `,
        [employeeId, teamLeadId]
      );

    if (members.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message:
          "Employee not found in your team",
      });
    }

    // Leave statuses cannot be marked manually
    const [statuses] =
      await connection.query(
        `
        SELECT
          status_id,
          code,
          name,
          counts_as_production_day
        FROM attendance_status
        WHERE code = ?
          AND is_leave = 0
        LIMIT 1
        `,
        [normalizedStatus]
      );

    if (statuses.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Invalid attendance status",
      });
    }

    const selectedStatus = statuses[0];

    const attendanceHours =
      hours === undefined ||
      hours === null ||
      hours === ""
        ? Number(
            selectedStatus
              .counts_as_production_day
          ) === 1
          ? 8
          : 0
        : Number(hours);

    if (
      !Number.isFinite(attendanceHours) ||
      attendanceHours < 0 ||
      attendanceHours > 24
    ) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Hours must be between 0 and 24",
      });
    }

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
      VALUES (
        ?,
        COALESCE(?, CURDATE()),
        ?,
        ?,
        ?,
        ?
      )

      ON DUPLICATE KEY UPDATE
        status_id = VALUES(status_id),
        hours = VALUES(hours),
        note = VALUES(note),
        approved_by = VALUES(approved_by)
      `,
      [
        employeeId,
        attendanceDate || null,
        selectedStatus.status_id,
        attendanceHours,
        String(note || "").trim() || null,
        teamLeadId,
      ]
    );

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
        "Marked employee attendance",
        "attendance",
        String(employeeId),
        `${members[0].full_name}: ${selectedStatus.name}`,
      ]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message:
        "Attendance marked successfully",
      attendance: {
        userId: employeeId,
        statusCode: selectedStatus.code,
        status: selectedStatus.name,
        hours: attendanceHours,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(
      "Mark Attendance Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to mark attendance",
      error: error.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  getMyAttendance,
  getAttendanceSummary,
  markAttendance,
};