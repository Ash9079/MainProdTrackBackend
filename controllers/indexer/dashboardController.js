const db = require("../../config/db");

const getIndexerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const [productionRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(docs_received), 0) AS total_received,
        COALESCE(SUM(docs_completed), 0) AS total_completed,
        COALESCE(
          SUM(docs_received - docs_completed),
          0
        ) AS total_pending
      FROM daily_entry
      WHERE user_id = ?
      `,
      [userId]
    );

    const [todayRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(docs_completed), 0) AS today_productivity
      FROM daily_entry
      WHERE user_id = ?
        AND production_date = CURDATE()
      `,
      [userId]
    );

    const [projectRows] = await db.query(
      `
      SELECT COUNT(*) AS assigned_projects
      FROM project_assignment
      WHERE user_id = ?
      `,
      [userId]
    );

    const [correctionRows] = await db.query(
      `
      SELECT COUNT(*) AS pending_corrections
      FROM correction_request cr
      JOIN correction_status cs
        ON cs.status_id = cr.status_id
      WHERE cr.requested_by = ?
        AND cs.code = 'pending'
      `,
      [userId]
    );

    const [notificationRows] = await db.query(
      `
      SELECT COUNT(*) AS unread_notifications
      FROM notification
      WHERE user_id = ?
        AND is_read = 0
      `,
      [userId]
    );

    const [guideRows] = await db.query(
      `
      SELECT
        COUNT(DISTINCT gv.version_id) AS pending_guides
      FROM project_assignment pa
      JOIN guide g
        ON g.project_id = pa.project_id
      JOIN guide_version gv
        ON gv.guide_id = g.guide_id
       AND gv.is_latest = 1
       AND gv.requires_ack = 1
      LEFT JOIN guide_acknowledgement ga
        ON ga.version_id = gv.version_id
       AND ga.user_id = pa.user_id
      WHERE pa.user_id = ?
        AND (
          ga.ack_id IS NULL
          OR ga.status = 'unread'
        )
      `,
      [userId]
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