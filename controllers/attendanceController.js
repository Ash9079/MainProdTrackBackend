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

module.exports = {
  getMyAttendance,
  getAttendanceSummary,
};