const db = require("../config/db");

// ======================================================
// REPORT SUMMARY
//
// Indexer:
//   Returns the logged-in Indexer's production.
//
// Team Lead:
//   Returns production of all members belonging to
//   the logged-in Team Lead.
// ======================================================

const getMyReportSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let rows;

    // =========================
    // INDEXER REPORT
    // =========================
    if (role === "indexer") {
      [rows] = await db.query(
        `
        SELECT
          COALESCE(SUM(documents_received), 0) AS totalReceived,
          COALESCE(SUM(documents_completed), 0) AS totalCompleted
        FROM daily_entries
        WHERE user_id = ?
        `,
        [userId]
      );
    }

    // =========================
    // TEAM LEAD REPORT
    // =========================
    else if (role === "teamLead") {
      [rows] = await db.query(
        `
        SELECT
          COALESCE(SUM(de.documents_received), 0) AS totalReceived,
          COALESCE(SUM(de.documents_completed), 0) AS totalCompleted

        FROM team_members tm

        LEFT JOIN daily_entries de
          ON de.user_id = tm.member_id

        WHERE tm.team_lead_id = ?
        `,
        [userId]
      );
    }

    // =========================
    // UNSUPPORTED ROLE
    // =========================
    else {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this report",
      });
    }

    const totalReceived = Number(rows[0].totalReceived);
    const totalCompleted = Number(rows[0].totalCompleted);

    const totalPending = Math.max(
      totalReceived - totalCompleted,
      0
    );

    const completionRate =
      totalReceived > 0
        ? Math.round(
            (totalCompleted / totalReceived) * 100
          )
        : 0;

    return res.status(200).json({
      success: true,

      summary: {
        totalReceived,
        totalCompleted,
        totalPending,
        completionRate,
      },
    });

  } catch (error) {
    console.error("Report Summary Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load report summary",
      error: error.message,
    });
  }
};


// ======================================================
// DAILY PRODUCTION REPORT
//
// Indexer:
//   Groups logged-in Indexer's production by date.
//
// Team Lead:
//   Groups production of the entire team by date.
// ======================================================

const getMyDailyProduction = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let production;

    // =========================
    // INDEXER
    // =========================
    if (role === "indexer") {
      [production] = await db.query(
        `
        SELECT
          DATE(production_date) AS production_date,
          DAYNAME(production_date) AS day_name,

          COALESCE(
            SUM(documents_received),
            0
          ) AS received,

          COALESCE(
            SUM(documents_completed),
            0
          ) AS completed

        FROM daily_entries

        WHERE user_id = ?

        GROUP BY
          DATE(production_date),
          DAYNAME(production_date)

        ORDER BY DATE(production_date) ASC
        `,
        [userId]
      );
    }

    // =========================
    // TEAM LEAD
    // =========================
    else if (role === "teamLead") {
      [production] = await db.query(
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

        GROUP BY
          DATE(de.production_date),
          DAYNAME(de.production_date)

        ORDER BY DATE(de.production_date) ASC
        `,
        [userId]
      );
    }

    // =========================
    // UNSUPPORTED ROLE
    // =========================
    else {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this report",
      });
    }

    return res.status(200).json({
      success: true,
      count: production.length,
      production,
    });

  } catch (error) {
    console.error("Daily Production Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load daily production report",
      error: error.message,
    });
  }
};


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getMyReportSummary,
  getMyDailyProduction,
};