const db = require("../../config/db");

// Gets all team members reporting to the logged-in Team Lead
const getMyTeam = async (req, res) => {
  try {
    const teamLeadId = req.user.id;

const [members] = await db.query(
  `
  SELECT
    u.user_id AS id,
    u.user_id,
    u.emp_code AS employee_id,
    u.emp_code AS employee_code,
    u.full_name AS name,
    u.full_name,
    u.email,

    COALESCE(
      (
        SELECT GROUP_CONCAT(
          DISTINCT p.project_name
          ORDER BY p.project_name
          SEPARATOR ', '
        )
        FROM project_assignment pa
        JOIN project p
          ON p.project_id = pa.project_id
        WHERE pa.user_id = u.user_id
      ),
      ''
    ) AS projects,

    COALESCE(
      (
        SELECT SUM(de.docs_completed)
        FROM daily_entry de
        WHERE de.user_id = u.user_id
          AND de.production_date = CURDATE()
      ),
      0
    ) AS today_completed,

    CASE
      WHEN EXISTS (
        SELECT 1
        FROM project_assignment pa

        JOIN guide g
          ON g.project_id = pa.project_id

        JOIN guide_version gv
          ON gv.guide_id = g.guide_id
         AND gv.is_latest = 1
         AND gv.requires_ack = 1

        LEFT JOIN guide_acknowledgement ga
          ON ga.version_id = gv.version_id
         AND ga.user_id = u.user_id
         AND ga.status = 'read'

        WHERE pa.user_id = u.user_id
          AND ga.ack_id IS NULL
      )
      THEN 'PENDING'
      ELSE 'DONE'
    END AS guide_acknowledgement,

    CASE
      WHEN EXISTS (
        SELECT 1
        FROM leave_request lr
        WHERE lr.user_id = u.user_id
          AND lr.status = 'APPROVED'
          AND CURDATE() BETWEEN lr.start_date AND lr.end_date
      )
      THEN 'LEAVE'

      ELSE COALESCE(
        (
          SELECT ats.name
          FROM attendance a

          JOIN attendance_status ats
            ON ats.status_id = a.status_id

          WHERE a.user_id = u.user_id
            AND a.att_date = CURDATE()

          LIMIT 1
        ),
        'NOT MARKED'
      )
    END AS attendance_status

  FROM users u

  WHERE u.team_lead_id = ?
    AND u.status = 'active'

  ORDER BY u.full_name ASC
  `,
  [teamLeadId]
);

    return res.status(200).json({
      success: true,
      count: members.length,
      members,
    });
  } catch (error) {
    console.error("Get My Team Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load team members",
      error: error.message,
    });
  }
};

module.exports = {
  getMyTeam,
};