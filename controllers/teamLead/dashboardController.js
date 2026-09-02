const db = require("../../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — get all indexer user_ids who report to this team lead
// Schema: users.team_lead_id = teamLeadId  AND  role = 'indexer'
// ─────────────────────────────────────────────────────────────────────────────
async function getTeamMemberIds(teamLeadId) {
  const [rows] = await db.query(
    `SELECT user_id FROM users
     WHERE team_lead_id = ? AND status = 'active'`,
    [teamLeadId]
  );
  return rows.map((r) => r.user_id);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MAIN DASHBOARD SUMMARY  GET /api/team-lead/dashboard
// ─────────────────────────────────────────────────────────────────────────────
const getTeamLeadDashboard = async (req, res) => {
  try {
    const teamLeadId = req.user.id;
    const memberIds = await getTeamMemberIds(teamLeadId);
    const teamSize = memberIds.length;

    if (teamSize === 0) {
      return res.status(200).json({
        success: true,
        dashboard: {
          teamSize: 0,
          completedToday: 0,
          pendingApprovals: 0,
          ackCompliance: { rate: 0, acknowledged: 0, total: 0, pending: 0 },
        },
      });
    }

    const placeholders = memberIds.map(() => "?").join(",");

    // ── Today's production totals for the whole team ──
    const [prodRows] = await db.query(
      `SELECT
         COALESCE(SUM(docs_completed), 0) AS completed_today
       FROM daily_entry
       WHERE user_id IN (${placeholders})
         AND production_date = CURDATE()`,
      memberIds
    );

    // ── Pending correction requests raised by team members ──
    const [corrRows] = await db.query(
      `SELECT COUNT(*) AS pending_approvals
       FROM correction_request cr
       JOIN correction_status cs ON cs.status_id = cr.status_id
       WHERE cr.requested_by IN (${placeholders})
         AND cs.code = 'pending'`,
      memberIds
    );

    // ── Guide acknowledgement compliance ──
    // For every (member, latest-guide-version) pair that requires_ack,
    // count how many are read vs unread/missing.
    const [ackRows] = await db.query(
      `SELECT
         COUNT(DISTINCT CONCAT(pa.user_id, '-', gv.version_id))          AS total_pairs,
         COUNT(DISTINCT CASE WHEN ga.status = 'read'
               THEN CONCAT(pa.user_id, '-', gv.version_id) END)          AS acked_pairs
       FROM users u
       JOIN project_assignment pa ON pa.user_id = u.user_id
       JOIN guide g               ON g.project_id = pa.project_id
       JOIN guide_version gv      ON gv.guide_id  = g.guide_id
                                 AND gv.is_latest = 1
                                 AND gv.requires_ack = 1
       LEFT JOIN guide_acknowledgement ga
                                  ON ga.version_id = gv.version_id
                                 AND ga.user_id    = pa.user_id
       WHERE u.team_lead_id = ?
         AND u.status = 'active'`,
      [teamLeadId]
    );

    const totalPairs  = Number(ackRows[0].total_pairs)  || 0;
    const ackedPairs  = Number(ackRows[0].acked_pairs)  || 0;
    const ackRate     = totalPairs > 0 ? Math.round((ackedPairs / totalPairs) * 100) : 100;

    return res.status(200).json({
      success: true,
      dashboard: {
        teamSize,
        completedToday:   Number(prodRows[0].completed_today),
        pendingApprovals: Number(corrRows[0].pending_approvals),
        ackCompliance: {
          rate:         ackRate,
          acknowledged: ackedPairs,
          total:        totalPairs,
          pending:      totalPairs - ackedPairs,
        },
      },
    });
  } catch (err) {
    console.error("Team Lead Dashboard Error:", err);
    return res.status(500).json({ success: false, message: "Failed to load dashboard", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. TEAM PRODUCTIVITY — last 7 days   GET /api/team-lead/dashboard/productivity
// ─────────────────────────────────────────────────────────────────────────────
const getTeamProductivity = async (req, res) => {
  try {
    const teamLeadId = req.user.id;
    const memberIds  = await getTeamMemberIds(teamLeadId);

    if (memberIds.length === 0) {
      return res.status(200).json({ success: true, productivity: [] });
    }

    const placeholders = memberIds.map(() => "?").join(",");

    const [rows] = await db.query(
      `SELECT
         grp.prod_date                          AS production_date,
         DAYNAME(grp.prod_date)                 AS day_name,
         LEFT(DAYNAME(grp.prod_date), 3)        AS day_short,
         grp.received,
         grp.completed
       FROM (
         SELECT
           DATE(production_date)              AS prod_date,
           COALESCE(SUM(docs_received),  0)   AS received,
           COALESCE(SUM(docs_completed), 0)   AS completed
         FROM daily_entry
         WHERE user_id IN (${placeholders})
           AND production_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
           AND production_date <= CURDATE()
         GROUP BY DATE(production_date)
       ) grp
       ORDER BY grp.prod_date ASC`,
      memberIds
    );

    return res.status(200).json({ success: true, productivity: rows });
  } catch (err) {
    console.error("Team Productivity Error:", err);
    return res.status(500).json({ success: false, message: "Failed to load productivity", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPLETION SPLIT (donut)   GET /api/team-lead/dashboard/completion-split
// ─────────────────────────────────────────────────────────────────────────────
const getCompletionSplit = async (req, res) => {
  try {
    const teamLeadId = req.user.id;
    const memberIds  = await getTeamMemberIds(teamLeadId);

    if (memberIds.length === 0) {
      return res.status(200).json({
        success: true,
        completionSplit: { received: 0, completed: 0, pending: 0, inReview: 0, completionPct: 0 },
      });
    }

    const placeholders = memberIds.map(() => "?").join(",");

    // all-time totals per status
    const [rows] = await db.query(
      `SELECT
         COALESCE(SUM(docs_received),  0)                                         AS received,
         COALESCE(SUM(docs_completed), 0)                                         AS completed,
         COALESCE(SUM(CASE WHEN es.code IN ('submitted','reviewed')
                           THEN docs_completed ELSE 0 END), 0)                    AS in_review
       FROM daily_entry de
       JOIN entry_status es ON es.status_id = de.status_id
       WHERE de.user_id IN (${placeholders})`,
      memberIds
    );

    const received   = Number(rows[0].received);
    const completed  = Number(rows[0].completed);
    const inReview   = Number(rows[0].in_review);
    const pending    = Math.max(received - completed, 0);
    const completionPct = received > 0 ? Math.round((completed / received) * 100) : 0;

    return res.status(200).json({
      success: true,
      completionSplit: { received, completed, pending, inReview, completionPct },
    });
  } catch (err) {
    console.error("Completion Split Error:", err);
    return res.status(500).json({ success: false, message: "Failed to load completion split", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. TEAM MEMBERS TABLE   GET /api/team-lead/dashboard/team-members
// ─────────────────────────────────────────────────────────────────────────────
const getDashboardTeamMembers = async (req, res) => {
  try {
    const teamLeadId = req.user.id;

    // members with today's production
    const [members] = await db.query(
      `SELECT
         u.user_id,
         u.emp_code,
         u.full_name,
         u.designation,
         COALESCE(SUM(de.docs_completed), 0)                             AS completed_today,
         COALESCE(SUM(de.docs_received - de.docs_completed), 0)         AS pending_today,
         (SELECT GROUP_CONCAT(DISTINCT p.project_name ORDER BY p.project_name SEPARATOR ', ')
          FROM project_assignment pa2
          JOIN project p ON p.project_id = pa2.project_id AND p.status = 'active'
          WHERE pa2.user_id = u.user_id)                                  AS projects
       FROM users u
       LEFT JOIN daily_entry de
         ON de.user_id = u.user_id
        AND de.production_date = CURDATE()
       WHERE u.team_lead_id = ?
         AND u.status = 'active'
       GROUP BY u.user_id, u.emp_code, u.full_name, u.designation
       ORDER BY completed_today DESC`,
      [teamLeadId]
    );

    if (members.length === 0) {
      return res.status(200).json({ success: true, members: [] });
    }

    const memberIds    = members.map((m) => m.user_id);
    const placeholders = memberIds.map(() => "?").join(",");

    // attendance today
    const [attRows] = await db.query(
      `SELECT a.user_id, ats.code AS att_code
       FROM attendance a
       JOIN attendance_status ats ON ats.status_id = a.status_id
       WHERE a.user_id IN (${placeholders})
         AND a.att_date = CURDATE()`,
      memberIds
    );
    const attMap = {};
    attRows.forEach((r) => { attMap[r.user_id] = r.att_code; });

    // guide acknowledgement per member — any pending unread
    const [guideRows] = await db.query(
      `SELECT pa.user_id,
              SUM(CASE WHEN ga.status = 'unread' OR ga.ack_id IS NULL THEN 1 ELSE 0 END) AS pending_acks
       FROM project_assignment pa
       JOIN guide g          ON g.project_id  = pa.project_id
       JOIN guide_version gv ON gv.guide_id   = g.guide_id
                            AND gv.is_latest = 1
                            AND gv.requires_ack = 1
       LEFT JOIN guide_acknowledgement ga
                            ON ga.version_id = gv.version_id
                           AND ga.user_id    = pa.user_id
       WHERE pa.user_id IN (${placeholders})
       GROUP BY pa.user_id`,
      memberIds
    );
    const guideMap = {};
    guideRows.forEach((r) => { guideMap[r.user_id] = Number(r.pending_acks); });

    // Assign initials colour consistently
    const COLOURS = ["#4f73e3","#3aab8e","#5b5ce2","#e05a3a","#7c4dbd","#d97706","#0891b2"];

    const result = members.map((m, idx) => {
      const attCode    = attMap[m.user_id] || "not_marked";
      const pendingAck = guideMap[m.user_id] ?? 0;
      const nameParts  = m.full_name.trim().split(" ");
      const initials   = nameParts.length >= 2
        ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
        : m.full_name.substring(0, 2).toUpperCase();

      // map attendance_status.code → display label
      const statusLabel =
        attCode === "present"       ? "PRESENT"  :
        attCode === "absent"        ? "ABSENT"   :
        attCode === "planned_leave" ? "LEAVE"    :
        attCode === "sick_leave"    ? "LEAVE"    :
        attCode === "training"      ? "TRAINING" :
        attCode === "holiday"       ? "HOLIDAY"  : "NOT MARKED";

      return {
        userId:        m.user_id,
        empCode:       m.emp_code,
        name:          m.full_name,
        initials:      initials.toUpperCase(),
        avatarColor:   COLOURS[idx % COLOURS.length],
        designation:   m.designation || "",
        project:       m.projects    || "—",
        completedToday: Number(m.completed_today),
        pendingToday:   Number(m.pending_today),
        guideAck:      pendingAck === 0 ? "DONE" : "PENDING",
        status:        statusLabel,
      };
    });

    return res.status(200).json({ success: true, members: result });
  } catch (err) {
    console.error("Dashboard Team Members Error:", err);
    return res.status(500).json({ success: false, message: "Failed to load team members", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. TEAM AVAILABILITY   GET /api/team-lead/availability
// ─────────────────────────────────────────────────────────────────────────────
const getTeamAvailability = async (req, res) => {
  try {
    const teamLeadId = req.user.id;
    const memberIds  = await getTeamMemberIds(teamLeadId);

    if (memberIds.length === 0) {
      return res.status(200).json({ success: true, summary: { totalMembers: 0, availableMembers: 0, onLeave: 0 }, members: [] });
    }

    const placeholders = memberIds.map(() => "?").join(",");

    const [rows] = await db.query(
      `SELECT
         u.user_id, u.full_name,
         COALESCE(ats.code, 'not_marked') AS att_code
       FROM users u
       LEFT JOIN attendance a   ON a.user_id   = u.user_id AND a.att_date = CURDATE()
       LEFT JOIN attendance_status ats ON ats.status_id = a.status_id
       WHERE u.user_id IN (${placeholders})`,
      memberIds
    );

    const onLeave = rows.filter((r) =>
      ["planned_leave","sick_leave"].includes(r.att_code)
    ).length;

    const members = rows.map((r) => ({
      userId: r.user_id,
      name:   r.full_name,
      availabilityStatus: ["planned_leave","sick_leave"].includes(r.att_code) ? "ON_LEAVE" : "AVAILABLE",
    }));

    return res.status(200).json({
      success: true,
      summary: { totalMembers: rows.length, availableMembers: rows.length - onLeave, onLeave },
      members,
    });
  } catch (err) {
    console.error("Team Availability Error:", err);
    return res.status(500).json({ success: false, message: "Failed to load team availability", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. AVAILABILITY PRODUCTIVITY   GET /api/team-lead/dashboard/availability-productivity
// ─────────────────────────────────────────────────────────────────────────────
const getAvailabilityProductivity = async (req, res) => {
  try {
    const teamLeadId = req.user.id;
    const memberIds  = await getTeamMemberIds(teamLeadId);
    const totalMembers = memberIds.length;

    if (totalMembers === 0) {
      return res.status(200).json({
        success: true,
        productivity: { totalMembers: 0, availableMembers: 0, onLeave: 0, receivedToday: 0, completedToday: 0, completionRate: 0, averagePerAvailableMember: 0 },
      });
    }

    const placeholders = memberIds.map(() => "?").join(",");

    const [leaveRows] = await db.query(
      `SELECT COUNT(DISTINCT a.user_id) AS on_leave
       FROM attendance a
       JOIN attendance_status ats ON ats.status_id = a.status_id
       WHERE a.user_id IN (${placeholders})
         AND a.att_date = CURDATE()
         AND ats.code IN ('planned_leave','sick_leave')`,
      memberIds
    );

    const [prodRows] = await db.query(
      `SELECT
         COALESCE(SUM(docs_received),  0) AS received_today,
         COALESCE(SUM(docs_completed), 0) AS completed_today
       FROM daily_entry
       WHERE user_id IN (${placeholders})
         AND production_date = CURDATE()`,
      memberIds
    );

    const onLeave          = Number(leaveRows[0].on_leave);
    const availableMembers = Math.max(totalMembers - onLeave, 0);
    const receivedToday    = Number(prodRows[0].received_today);
    const completedToday   = Number(prodRows[0].completed_today);
    const completionRate   = receivedToday > 0 ? Math.round((completedToday / receivedToday) * 100) : 0;
    const avgPerMember     = availableMembers > 0 ? Math.round(completedToday / availableMembers) : 0;

    return res.status(200).json({
      success: true,
      productivity: { totalMembers, availableMembers, onLeave, receivedToday, completedToday, completionRate, averagePerAvailableMember: avgPerMember },
    });
  } catch (err) {
    console.error("Availability Productivity Error:", err);
    return res.status(500).json({ success: false, message: "Failed to calculate availability productivity", error: err.message });
  }
};

module.exports = {
  getTeamLeadDashboard,
  getTeamProductivity,
  getCompletionSplit,
  getDashboardTeamMembers,
  getTeamAvailability,
  getAvailabilityProductivity,
};
