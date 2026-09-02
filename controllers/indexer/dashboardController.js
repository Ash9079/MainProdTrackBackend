const db = require("../../config/db");

const getIndexerDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // ── 1. STAT CARDS ─────────────────────────────────────────
    const [productionRows] = await db.query(
      `
      SELECT
        COALESCE(SUM(docs_received), 0)  AS total_received,
        COALESCE(SUM(docs_completed), 0) AS total_completed,
        COALESCE(SUM(docs_received - docs_completed), 0) AS total_pending
      FROM daily_entry
      WHERE user_id = ?
      `,
      [userId]
    );

    const [todayRows] = await db.query(
      `
      SELECT COALESCE(SUM(docs_completed), 0) AS today_productivity
      FROM daily_entry
      WHERE user_id = ?
        AND production_date = CURDATE()
      `,
      [userId]
    );

    const [projectCountRows] = await db.query(
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
      JOIN correction_status cs ON cs.status_id = cr.status_id
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

    const [pendingGuideCountRows] = await db.query(
      `
      SELECT COUNT(DISTINCT gv.version_id) AS pending_guides
      FROM project_assignment pa
      JOIN guide g        ON g.project_id  = pa.project_id
      JOIN guide_version gv ON gv.guide_id = g.guide_id
        AND gv.is_latest  = 1
        AND gv.requires_ack = 1
      LEFT JOIN guide_acknowledgement ga
        ON ga.version_id = gv.version_id
       AND ga.user_id    = pa.user_id
      WHERE pa.user_id = ?
        AND (ga.ack_id IS NULL OR ga.status = 'unread')
      `,
      [userId]
    );

    // ── 2a. UNREAD PROJECT UPDATES COUNT ─────────────────────
    // Guide versions uploaded in last 30 days that user hasn't acknowledged
    const [unreadUpdateCountRows] = await db.query(
      `
      SELECT COUNT(DISTINCT gv.version_id) AS unread_updates
      FROM project_assignment pa
      JOIN project p          ON p.project_id  = pa.project_id
        AND p.status = 'active'
      JOIN guide g            ON g.project_id  = p.project_id
      JOIN guide_version gv   ON gv.guide_id   = g.guide_id
        AND gv.uploaded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      LEFT JOIN guide_acknowledgement ga
        ON ga.version_id = gv.version_id
       AND ga.user_id    = pa.user_id
       AND ga.status     = 'read'
      WHERE pa.user_id = ?
        AND ga.ack_id IS NULL
      `,
      [userId]
    );

    // ── 2b. PROJECT UPDATES (latest guide versions for assigned projects) ──
    const [projectUpdateRows] = await db.query(
      `
      SELECT
        p.project_name,
        g.title        AS guide_title,
        gv.version_label,
        gv.change_summary,
        gv.effective_date,
        gv.uploaded_at,
        CASE
          WHEN gv.uploaded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          THEN 'NEW'
          ELSE 'UPDATED'
        END AS badge
      FROM project_assignment pa
      JOIN project p        ON p.project_id  = pa.project_id
        AND p.status = 'active'
      JOIN guide g          ON g.project_id  = p.project_id
      JOIN guide_version gv ON gv.guide_id   = g.guide_id
        AND gv.is_latest = 1
      WHERE pa.user_id = ?
      ORDER BY gv.uploaded_at DESC
      LIMIT 5
      `,
      [userId]
    );

    // ── 3. ANNOUNCEMENTS (global + user's assigned projects) ──
    const [announcementRows] = await db.query(
      `
      SELECT
        a.announcement_id,
        a.title,
        a.body,
        a.effective_date,
        a.created_at,
        p.project_name
      FROM announcement a
      LEFT JOIN project p ON p.project_id = a.project_id
      WHERE a.project_id IS NULL
         OR a.project_id IN (
              SELECT project_id
              FROM project_assignment
              WHERE user_id = ?
            )
      ORDER BY a.created_at DESC
      LIMIT 5
      `,
      [userId]
    );

    // ── 4. PENDING ACKNOWLEDGEMENTS ───────────────────────────
    const [pendingAckRows] = await db.query(
      `
      SELECT
        gv.version_id,
        gv.version_label,
        g.title        AS guide_title,
        p.project_name,
        gv.effective_date,
        gv.uploaded_at,
        COALESCE(ga.status, 'unread') AS ack_status
      FROM project_assignment pa
      JOIN project p          ON p.project_id  = pa.project_id
      JOIN guide g            ON g.project_id  = p.project_id
      JOIN guide_version gv   ON gv.guide_id   = g.guide_id
        AND gv.is_latest    = 1
        AND gv.requires_ack = 1
      LEFT JOIN guide_acknowledgement ga
        ON ga.version_id = gv.version_id
       AND ga.user_id    = pa.user_id
      WHERE pa.user_id = ?
        AND (ga.ack_id IS NULL OR ga.status = 'unread')
      ORDER BY gv.uploaded_at DESC
      `,
      [userId]
    );

    // ── 5. MY PROJECTS ────────────────────────────────────────
    const [myProjectRows] = await db.query(
      `
      SELECT
        p.project_id,
        p.project_name,
        p.project_code,
        p.status
      FROM project_assignment pa
      JOIN project p ON p.project_id = pa.project_id
        AND p.status = 'active'
      WHERE pa.user_id = ?
      ORDER BY p.project_name ASC
      `,
      [userId]
    );

    // ── BUILD RESPONSE ────────────────────────────────────────
    const production = productionRows[0];

    // Format project updates
    const projectUpdates = projectUpdateRows.map((row) => ({
      badge: row.badge,
      title: `${row.project_name} — ${row.guide_title}`,
      description: `Updated ${formatDate(row.uploaded_at)} · ${row.change_summary || "Guide updated"}`,
      effectiveDate: row.effective_date
        ? formatDateShort(row.effective_date)
        : null,
      versionLabel: row.version_label,
    }));

    // Format announcements
    const announcements = announcementRows.map((row) => ({
      id: row.announcement_id,
      title: row.title,
      description: row.body || "",
      date: formatDateShort(row.created_at),
      projectName: row.project_name || null,
    }));

    // Format pending acknowledgements
    const pendingAcknowledgements = pendingAckRows.map((row) => ({
      versionId: row.version_id,
      name: `${row.guide_title} ${row.version_label}`,
      guideName: row.guide_title,
      versionLabel: row.version_label,
      projectName: row.project_name,
      updatedDate: row.effective_date
        ? formatDateShort(row.effective_date)
        : formatDateShort(row.uploaded_at),
      status: "PENDING",
    }));

    // Format my projects
    const myProjects = myProjectRows.map((row) => ({
      id: row.project_id,
      name: row.project_name,
      code: row.project_code,
    }));

    // Acknowledgement banner — first pending guide
    const acknowledgementBanner =
      pendingAcknowledgements.length > 0
        ? {
            show: true,
            title: pendingAcknowledgements[0].name,
            message: "needs your acknowledgement before you can submit entries.",
          }
        : { show: false, title: null, message: null };

    return res.status(200).json({
      success: true,
      dashboard: {
        // Stat cards
        totalReceived: Number(production.total_received),
        totalCompleted: Number(production.total_completed),
        totalPending: Number(production.total_pending),
        todayProductivity: Number(todayRows[0].today_productivity),
        assignedProjects: Number(projectCountRows[0].assigned_projects),
        pendingCorrections: Number(correctionRows[0].pending_corrections),
        unreadNotifications: Number(notificationRows[0].unread_notifications),
        pendingGuideAcknowledgements: Number(pendingGuideCountRows[0].pending_guides),
        unreadProjectUpdates: Number(unreadUpdateCountRows[0].unread_updates),

        // Section data
        projectUpdates,
        announcements,
        pendingAcknowledgements,
        myProjects,
        acknowledgementBanner,
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

// ── HELPERS ──────────────────────────────────────────────────────────
function formatDate(dateVal) {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateShort(dateVal) {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

module.exports = { getIndexerDashboard };
