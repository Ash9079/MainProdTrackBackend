const db = require("../../config/db");

// Gets Indexer dashboard summary data
const getIndexerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const [productionRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(documents_received), 0) AS total_received,
        COALESCE(SUM(documents_completed), 0) AS total_completed,
        COALESCE(
          SUM(documents_received - documents_completed),
          0
        ) AS total_pending
      FROM daily_entries
      WHERE user_id = ?
      `,
      [userId]
    );

    const [todayRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(documents_completed), 0) AS today_productivity
      FROM daily_entries
      WHERE user_id = ?
        AND production_date = CURDATE()
      `,
      [userId]
    );

    const [projectRows] = await db.query(
      `
      SELECT COUNT(*) AS assigned_projects
      FROM user_project_assignments
      WHERE user_id = ?
      `,
      [userId]
    );

    const [correctionRows] = await db.query(
      `
      SELECT COUNT(*) AS pending_corrections
      FROM correction_requests
      WHERE user_id = ?
        AND status = 'PENDING'
      `,
      [userId]
    );

    const [notificationRows] = await db.query(
      `
      SELECT COUNT(*) AS unread_notifications
      FROM notifications
      WHERE user_id = ?
        AND is_read = 0
      `,
      [userId]
    );

    const [guideRows] = await db.query(
      `
      SELECT COUNT(*) AS pending_guides
      FROM guides g

      JOIN user_project_assignments upa
        ON upa.project_id = g.project_id
        AND upa.user_id = ?

      LEFT JOIN guide_acknowledgements ga
        ON ga.guide_id = g.id
        AND ga.user_id = ?

      WHERE g.status = 'active'
        AND ga.id IS NULL
      `,
      [userId, userId]
    );

    const production = productionRows[0];

    return res.status(200).json({
      success: true,

      dashboard: {
        totalReceived: Number(production.total_received),
        totalCompleted: Number(production.total_completed),
        totalPending: Number(production.total_pending),

        todayProductivity: Number(
          todayRows[0].today_productivity
        ),

        assignedProjects: Number(
          projectRows[0].assigned_projects
        ),

        pendingCorrections: Number(
          correctionRows[0].pending_corrections
        ),

        unreadNotifications: Number(
          notificationRows[0].unread_notifications
        ),

        pendingGuideAcknowledgements: Number(
          guideRows[0].pending_guides
        ),
      },
    });
  } catch (error) {
    console.error("Indexer Dashboard Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load Indexer dashboard",
      error: error.message,
    });
  }
};

module.exports = {
  getIndexerDashboard,
};