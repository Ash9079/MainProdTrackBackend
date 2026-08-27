const db = require("../config/db");

// Gets attendance records for the logged-in user
const getMyAttendance = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(
      `
      SELECT
        id,
        attendance_date,
        day_name,
        status,
        hours,
        note
      FROM attendance
      WHERE user_id = ?
      ORDER BY attendance_date DESC
      `,
      [userId]
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
        SUM(status = 'Present') AS present_days,
        SUM(status = 'Planned Leave') AS leave_days,
        SUM(status = 'Training') AS training_days,
        COUNT(*) AS working_days
      FROM attendance
      WHERE user_id = ?
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