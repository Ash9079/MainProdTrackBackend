const db = require("../../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADMIN DASHBOARD  GET /api/admin/dashboard
// Returns: stat cards, backlog by project, KPI cards, monthly trend
// ─────────────────────────────────────────────────────────────────────────────
const getAdminDashboard = async (req, res) => {
  try {

    // ── 1. STAT CARDS ─────────────────────────────────────────────────────
    const [prodRows] = await db.query(`
      SELECT
        COALESCE(SUM(docs_received),  0) AS total_received,
        COALESCE(SUM(docs_completed), 0) AS total_completed,
        COALESCE(SUM(docs_received - docs_completed), 0) AS total_backlog
      FROM daily_entry
    `);

    const [employeeRows] = await db.query(`
      SELECT
        COUNT(*) AS active_employees
      FROM users
      WHERE status = 'active'
        AND role_id != 4
    `);

    const [projectCountRows] = await db.query(`
      SELECT COUNT(*) AS active_projects
      FROM project
      WHERE status = 'active'
    `);

    // ── 2. BACKLOG BY PROJECT ──────────────────────────────────────────────
    const [backlogRows] = await db.query(`
      SELECT
        p.project_name                                    AS name,
        COALESCE(SUM(de.docs_received),  0)              AS total_received,
        COALESCE(SUM(de.docs_completed), 0)              AS total_completed,
        COALESCE(SUM(de.docs_received - de.docs_completed), 0) AS backlog
      FROM project p
      LEFT JOIN daily_entry de ON de.project_id = p.project_id
      WHERE p.status = 'active'
      GROUP BY p.project_id, p.project_name
      ORDER BY backlog DESC
    `);

    // Calculate percentage for progress bar (backlog / total_received * 100)
    const maxBacklog = Math.max(...backlogRows.map((r) => Number(r.backlog)), 1);
    const backlog = backlogRows.map((r) => ({
      name:     r.name,
      total:    Number(r.backlog),
      received: Number(r.total_received),
      pct:      Number(r.total_received) > 0
        ? Math.round((Number(r.backlog) / Number(r.total_received)) * 100)
        : 0,
      barPct: Math.round((Number(r.backlog) / maxBacklog) * 100),
    }));

    // ── 3. KPI CARDS ──────────────────────────────────────────────────────
    // Pending corrections
    const [corrRows] = await db.query(`
      SELECT COUNT(*) AS pending_corrections
      FROM correction_request cr
      JOIN correction_status cs ON cs.status_id = cr.status_id
      WHERE cs.code = 'pending'
    `);

    // Guide compliance — (read acks / total required acks) * 100
    const [complianceRows] = await db.query(`
      SELECT
        COUNT(*)                                   AS total_pairs,
        SUM(CASE WHEN ga.status = 'read' THEN 1 ELSE 0 END) AS acked_pairs
      FROM project_assignment pa
      JOIN guide g          ON g.project_id  = pa.project_id
      JOIN guide_version gv ON gv.guide_id   = g.guide_id
                           AND gv.is_latest  = 1
                           AND gv.requires_ack = 1
      LEFT JOIN guide_acknowledgement ga
                           ON ga.version_id = gv.version_id
                          AND ga.user_id    = pa.user_id
    `);

    const totalPairs = Number(complianceRows[0].total_pairs)  || 0;
    const ackedPairs = Number(complianceRows[0].acked_pairs)  || 0;
    const complianceRate = totalPairs > 0
      ? Math.round((ackedPairs / totalPairs) * 100)
      : 100;

    // Missing entries today — active indexers who have NOT submitted today
    const [missingRows] = await db.query(`
      SELECT COUNT(*) AS missing_entries
      FROM users u
      WHERE u.status = 'active'
        AND u.role_id = 1
        AND NOT EXISTS (
          SELECT 1 FROM daily_entry de
          WHERE de.user_id = u.user_id
            AND de.production_date = CURDATE()
        )
    `);

    // ── 4. MONTHLY TREND — last 6 months ──────────────────────────────────
    const [trendRows] = await db.query(`
      SELECT
        grp.month_start,
        DATE_FORMAT(grp.month_start, '%b %Y')          AS month_label,
        grp.completed,
        grp.received
      FROM (
        SELECT
          DATE_FORMAT(production_date, '%Y-%m-01')     AS month_start,
          COALESCE(SUM(docs_completed), 0)             AS completed,
          COALESCE(SUM(docs_received),  0)             AS received
        FROM daily_entry
        WHERE production_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(production_date, '%Y-%m-01')
      ) grp
      ORDER BY grp.month_start ASC
    `);

    // ── BUILD RESPONSE ─────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      dashboard: {
        // Stat cards
        totalReceived:    Number(prodRows[0].total_received),
        totalCompleted:   Number(prodRows[0].total_completed),
        totalBacklog:     Number(prodRows[0].total_backlog),
        activeEmployees:  Number(employeeRows[0].active_employees),
        activeProjects:   Number(projectCountRows[0].active_projects),

        // Backlog by project
        backlogByProject: backlog,

        // KPI cards
        pendingCorrections: Number(corrRows[0].pending_corrections),
        guideCompliance: {
          rate:    complianceRate,
          acked:   ackedPairs,
          total:   totalPairs,
        },
        missingEntriesToday: Number(missingRows[0].missing_entries),

        // Monthly trend
        monthlyTrend: trendRows.map((r) => ({
          monthLabel: r.month_label,
          completed:  Number(r.completed),
          received:   Number(r.received),
        })),
      },
    });

  } catch (err) {
    console.error("Admin Dashboard Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load Admin dashboard",
      error: err.message,
    });
  }
};

module.exports = { getAdminDashboard };
