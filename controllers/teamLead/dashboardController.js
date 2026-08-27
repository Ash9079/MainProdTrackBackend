// Imports the MySQL database connection.
const db = require("../../config/db");


// Gets the main summary cards for the Team Lead dashboard.
const getTeamLeadDashboard = async (req, res) => {
  try {
    // Gets the logged-in Team Lead ID from the JWT token.
    const teamLeadId = req.user.id;

    // Counts how many employees belong to this Team Lead.
    const [teamResult] = await db.query(
      `
      SELECT COUNT(*) AS teamSize
      FROM team_members
      WHERE team_lead_id = ?
      `,
      [teamLeadId]
    );

    // Calculates today's received and completed production for the whole team.
    const [productionResult] = await db.query(
      `
      SELECT
        COALESCE(SUM(de.documents_received), 0) AS receivedToday,
        COALESCE(SUM(de.documents_completed), 0) AS completedToday

      FROM team_members tm

      LEFT JOIN daily_entries de
        ON de.user_id = tm.member_id
        AND de.production_date = CURDATE()

      WHERE tm.team_lead_id = ?
      `,
      [teamLeadId]
    );

    // Counts pending correction requests waiting for Team Lead approval.
    const [approvalResult] = await db.query(
      `
      SELECT COUNT(*) AS pendingApprovals

      FROM correction_requests cr

      JOIN team_members tm
        ON tm.member_id = cr.user_id

      WHERE tm.team_lead_id = ?
        AND cr.status = 'PENDING'
      `,
      [teamLeadId]
    );

    // Calculates today's attendance status for the Team Lead's team.
    const [attendanceResult] = await db.query(
      `
      SELECT

        COUNT(
          DISTINCT CASE
            WHEN EXISTS (
              SELECT 1
              FROM leave_requests lr
              WHERE lr.user_id = tm.member_id
                AND lr.status = 'APPROVED'
                AND CURDATE()
                  BETWEEN lr.start_date AND lr.end_date
            )
            THEN tm.member_id
          END
        ) AS onLeaveToday,

        COUNT(
          DISTINCT CASE
            WHEN a.status = 'Present'
            AND NOT EXISTS (
              SELECT 1
              FROM leave_requests lr
              WHERE lr.user_id = tm.member_id
                AND lr.status = 'APPROVED'
                AND CURDATE()
                  BETWEEN lr.start_date AND lr.end_date
            )
            THEN tm.member_id
          END
        ) AS presentToday,

        COUNT(
          DISTINCT CASE
            WHEN a.status = 'Training'
            AND NOT EXISTS (
              SELECT 1
              FROM leave_requests lr
              WHERE lr.user_id = tm.member_id
                AND lr.status = 'APPROVED'
                AND CURDATE()
                  BETWEEN lr.start_date AND lr.end_date
            )
            THEN tm.member_id
          END
        ) AS trainingToday

      FROM team_members tm

      LEFT JOIN attendance a
        ON a.user_id = tm.member_id
        AND a.attendance_date = CURDATE()

      WHERE tm.team_lead_id = ?
      `,
      [teamLeadId]
    );

    // Counts team members who have acknowledged active guides.
    const [guideResult] = await db.query(
      `
      SELECT
        COUNT(DISTINCT tm.member_id) AS totalMembers,

        COUNT(
          DISTINCT CASE
            WHEN ga.id IS NOT NULL
            THEN tm.member_id
          END
        ) AS acknowledgedMembers

      FROM team_members tm

      LEFT JOIN user_project_assignments upa
        ON upa.user_id = tm.member_id

      LEFT JOIN guides g
        ON g.project_id = upa.project_id
        AND g.status = 'active'

      LEFT JOIN guide_acknowledgements ga
        ON ga.guide_id = g.id
        AND ga.user_id = tm.member_id

      WHERE tm.team_lead_id = ?
      `,
      [teamLeadId]
    );

    // Converts the team size returned by MySQL into a JavaScript number.
    const teamSize = Number(teamResult[0].teamSize);

    // Converts today's received count into a JavaScript number.
    const receivedToday = Number(
      productionResult[0].receivedToday
    );

    // Converts today's completed count into a JavaScript number.
    const completedToday = Number(
      productionResult[0].completedToday
    );

    // Converts pending approval count into a JavaScript number.
    const pendingApprovals = Number(
      approvalResult[0].pendingApprovals
    );

    // Converts acknowledged member count into a JavaScript number.
    const acknowledgedMembers = Number(
      guideResult[0].acknowledgedMembers
    );

    // Calculates the guide acknowledgement percentage for the team.
    const acknowledgementRate =
      teamSize > 0
        ? Math.round(
            (acknowledgedMembers / teamSize) * 100
          )
        : 0;

    // Returns all main Team Lead dashboard summary values.
    return res.status(200).json({
      success: true,

      dashboard: {
        teamSize,

        receivedToday,

        completedToday,

        pendingToday: Math.max(
          receivedToday - completedToday,
          0
        ),

        completionRate:
          receivedToday > 0
            ? Math.round(
                (completedToday / receivedToday) * 100
              )
            : 0,

        pendingApprovals,

        attendance: {
          present: Number(
            attendanceResult[0].presentToday
          ),

          training: Number(
            attendanceResult[0].trainingToday
          ),

          onLeave: Number(
            attendanceResult[0].onLeaveToday
          ),
        },

        guideAcknowledgement: {
          acknowledged: acknowledgedMembers,
          total: teamSize,
          rate: acknowledgementRate,
        },
      },
    });

  } catch (error) {
    // Logs dashboard errors in the backend terminal.
    console.error(
      "Team Lead Dashboard Error:",
      error
    );

    // Returns an error response when dashboard data cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load Team Lead dashboard",
      error: error.message,
    });
  }
};


// Gets recent daily production totals for the Team Lead's entire team.
const getTeamProductivity = async (req, res) => {
  try {
    // Gets the logged-in Team Lead ID from the JWT token.
    const teamLeadId = req.user.id;

    // Groups team production by date for the last seven days.
    const [productivity] = await db.query(
      `
      SELECT
        DATE(de.production_date) AS production_date,
        DAYNAME(de.production_date) AS day_name,

        COALESCE(
          SUM(de.documents_received),
          0
        ) AS received,

        COALESCE(
          SUM(de.documents_completed),
          0
        ) AS completed

      FROM team_members tm

      JOIN daily_entries de
        ON de.user_id = tm.member_id

      WHERE tm.team_lead_id = ?
        AND de.production_date >=
            DATE_SUB(CURDATE(), INTERVAL 6 DAY)

        AND de.production_date <= CURDATE()

      GROUP BY
        DATE(de.production_date),
        DAYNAME(de.production_date)

      ORDER BY
        DATE(de.production_date) ASC
      `,
      [teamLeadId]
    );

    // Returns the Team Lead's daily team productivity data.
    return res.status(200).json({
      success: true,
      count: productivity.length,
      productivity,
    });

  } catch (error) {
    // Logs team productivity errors in the backend terminal.
    console.error(
      "Team Productivity Error:",
      error
    );

    // Returns an error when productivity data cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load team productivity",
      error: error.message,
    });
  }
};


// Gets completed and pending production totals for the Team Lead's team.
const getCompletionSplit = async (req, res) => {
  try {
    // Gets the logged-in Team Lead ID from the JWT token.
    const teamLeadId = req.user.id;

    // Calculates total received and completed work for all team members.
    const [rows] = await db.query(
      `
      SELECT
        COALESCE(
          SUM(de.documents_received),
          0
        ) AS received,

        COALESCE(
          SUM(de.documents_completed),
          0
        ) AS completed

      FROM team_members tm

      JOIN daily_entries de
        ON de.user_id = tm.member_id

      WHERE tm.team_lead_id = ?
      `,
      [teamLeadId]
    );

    // Converts received production into a JavaScript number.
    const received = Number(rows[0].received);

    // Converts completed production into a JavaScript number.
    const completed = Number(rows[0].completed);

    // Calculates remaining pending production.
    const pending = Math.max(
      received - completed,
      0
    );

    // Calculates completed production percentage.
    const completionPercentage =
      received > 0
        ? Math.round(
            (completed / received) * 100
          )
        : 0;

    // Calculates pending production percentage.
    const pendingPercentage =
      received > 0
        ? Math.round(
            (pending / received) * 100
          )
        : 0;

    // Returns completion and pending production values.
    return res.status(200).json({
      success: true,

      completionSplit: {
        received,
        completed,
        pending,
        completionPercentage,
        pendingPercentage,
      },
    });

  } catch (error) {
    // Logs completion split errors in the backend terminal.
    console.error(
      "Completion Split Error:",
      error
    );

    // Returns an error when completion split cannot be calculated.
    return res.status(500).json({
      success: false,
      message: "Failed to load completion split",
      error: error.message,
    });
  }
};


// Gets team member information displayed on the Team Lead dashboard.
const getDashboardTeamMembers = async (req, res) => {
  try {
    // Gets the logged-in Team Lead ID from the JWT token.
    const teamLeadId = req.user.id;

    // Gets team members with projects, production, attendance, and approved leave status.
    const [members] = await db.query(
      `
      SELECT
        u.id,
        u.employee_id,
        u.name,

        (
          SELECT GROUP_CONCAT(
            DISTINCT p.project_name
            ORDER BY p.project_name
            SEPARATOR ', '
          )

          FROM user_project_assignments upa

          JOIN projects p
            ON p.id = upa.project_id

          WHERE upa.user_id = u.id
        ) AS projects,

        (
          SELECT COALESCE(
            SUM(de.documents_completed),
            0
          )

          FROM daily_entries de

          WHERE de.user_id = u.id
            AND de.production_date = CURDATE()
        ) AS completed_today,

        CASE

          WHEN EXISTS (
            SELECT 1

            FROM leave_requests lr

            WHERE lr.user_id = u.id
              AND lr.status = 'APPROVED'
              AND CURDATE()
                BETWEEN lr.start_date AND lr.end_date
          )
          THEN 'LEAVE'

          WHEN EXISTS (
            SELECT 1

            FROM attendance a

            WHERE a.user_id = u.id
              AND a.attendance_date = CURDATE()
          )
          THEN (
            SELECT a.status

            FROM attendance a

            WHERE a.user_id = u.id
              AND a.attendance_date = CURDATE()

            LIMIT 1
          )

          ELSE 'NOT MARKED'

        END AS attendance_status

      FROM team_members tm

      JOIN users u
        ON u.id = tm.member_id

      WHERE tm.team_lead_id = ?

      ORDER BY completed_today DESC
      `,
      [teamLeadId]
    );

    // Returns team member information for the dashboard.
    return res.status(200).json({
      success: true,
      count: members.length,
      members,
    });

  } catch (error) {
    // Logs Team Member dashboard errors in the backend terminal.
    console.error(
      "Dashboard Team Members Error:",
      error
    );

    // Returns an error when team member data cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard team members",
      error: error.message,
    });
  }
};


// Gets team availability while considering approved leave.
const getTeamAvailability = async (req, res) => {
  try {
    // Gets the logged-in Team Lead ID from the JWT token.
    const teamLeadId = req.user.id;

    // Checks whether each employee is available or currently on approved leave.
    const [members] = await db.query(
      `
      SELECT
        u.id,
        u.employee_id,
        u.name,

        CASE

          WHEN EXISTS (
            SELECT 1

            FROM leave_requests lr

            WHERE lr.user_id = u.id
              AND lr.status = 'APPROVED'
              AND CURDATE()
                BETWEEN lr.start_date AND lr.end_date
          )
          THEN 'ON_LEAVE'

          ELSE 'AVAILABLE'

        END AS availability_status

      FROM team_members tm

      JOIN users u
        ON u.id = tm.member_id

      WHERE tm.team_lead_id = ?

      ORDER BY u.name ASC
      `,
      [teamLeadId]
    );

    // Counts the total employees belonging to this Team Lead.
    const totalMembers = members.length;

    // Counts how many employees are currently on approved leave.
    const onLeave = members.filter(
      (member) =>
        member.availability_status === "ON_LEAVE"
    ).length;

    // Calculates how many employees are available for productivity today.
    const availableMembers =
      totalMembers - onLeave;

    // Returns the team's current availability summary and individual statuses.
    return res.status(200).json({
      success: true,

      summary: {
        totalMembers,
        availableMembers,
        onLeave,
      },

      members,
    });

  } catch (error) {
    // Logs team availability errors in the backend terminal.
    console.error(
      "Team Availability Error:",
      error
    );

    // Returns an error when team availability cannot be loaded.
    return res.status(500).json({
      success: false,
      message: "Failed to load team availability",
      error: error.message,
    });
  }
};

// Calculates today's team productivity based only on employees available for work.
const getAvailabilityProductivity = async (req, res) => {
  try {
    // Gets the logged-in Team Lead ID from the JWT token.
    const teamLeadId = req.user.id;

    // Counts all employees belonging to this Team Lead.
    const [teamRows] = await db.query(
      `
      SELECT COUNT(*) AS totalMembers
      FROM team_members
      WHERE team_lead_id = ?
      `,
      [teamLeadId]
    );

    // Counts employees whose approved leave includes today's date.
    const [leaveRows] = await db.query(
      `
      SELECT COUNT(DISTINCT tm.member_id) AS onLeave

      FROM team_members tm

      JOIN leave_requests lr
        ON lr.user_id = tm.member_id

      WHERE tm.team_lead_id = ?
        AND lr.status = 'APPROVED'
        AND CURDATE() BETWEEN lr.start_date AND lr.end_date
      `,
      [teamLeadId]
    );

    // Calculates today's actual production completed by the whole team.
    const [productionRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(de.documents_received), 0) AS receivedToday,
        COALESCE(SUM(de.documents_completed), 0) AS completedToday

      FROM team_members tm

      LEFT JOIN daily_entries de
        ON de.user_id = tm.member_id
        AND DATE(de.production_date) = CURDATE()

      WHERE tm.team_lead_id = ?
      `,
      [teamLeadId]
    );

    // Converts the total team-member count from MySQL into a JavaScript number.
    const totalMembers = Number(teamRows[0].totalMembers);

    // Converts the approved-leave count from MySQL into a JavaScript number.
    const onLeave = Number(leaveRows[0].onLeave);

    // Calculates employees who are expected to be available today.
    const availableMembers = Math.max(totalMembers - onLeave, 0);

    // Converts today's received production into a JavaScript number.
    const receivedToday = Number(productionRows[0].receivedToday);

    // Converts today's completed production into a JavaScript number.
    const completedToday = Number(productionRows[0].completedToday);

    // Calculates average completed production only across available employees.
    const averagePerAvailableMember =
      availableMembers > 0
        ? Math.round(completedToday / availableMembers)
        : 0;

    // Calculates today's overall completion percentage from actual production.
    const completionRate =
      receivedToday > 0
        ? Math.round((completedToday / receivedToday) * 100)
        : 0;

    // Returns actual productivity together with leave-adjusted team availability.
    return res.status(200).json({
      success: true,

      productivity: {
        totalMembers,
        availableMembers,
        onLeave,
        receivedToday,
        completedToday,
        completionRate,
        averagePerAvailableMember,
      },
    });
  } catch (error) {
    // Logs productivity calculation errors in the backend terminal.
    console.error("Availability Productivity Error:", error);

    // Returns an error when leave-adjusted productivity cannot be calculated.
    return res.status(500).json({
      success: false,
      message: "Failed to calculate availability productivity",
      error: error.message,
    });
  }
};

// Exports all Team Lead dashboard functions so the routes can use them.
module.exports = {
  getTeamLeadDashboard,
  getTeamProductivity,
  getCompletionSplit,
  getDashboardTeamMembers,
  getTeamAvailability,
  getAvailabilityProductivity,
};