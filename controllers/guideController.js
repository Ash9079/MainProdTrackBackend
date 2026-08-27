const db = require("../config/db");
const path = require("path");

// ======================================================
// GET LATEST ACTIVE GUIDE
// Works for:
// - Indexer
// - Team Lead
// ======================================================

const getLatestGuide = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let guides = [];

    // ==================================================
    // INDEXER
    // Gets latest guide from projects assigned directly
    // to the logged-in Indexer.
    // ==================================================

    if (role === "indexer") {
      [guides] = await db.query(
        `
        SELECT
          g.id,
          g.project_id,
          g.title,
          g.version,
          g.description,
          g.updated_date,
          g.effective_date,
          g.file_url,
          g.status,
          g.created_at,

          p.project_name,

          CASE
            WHEN ga.id IS NULL THEN 0
            ELSE 1
          END AS acknowledged

        FROM guides g

        JOIN projects p
          ON p.id = g.project_id

        JOIN user_project_assignments upa
          ON upa.project_id = g.project_id
          AND upa.user_id = ?

        LEFT JOIN guide_acknowledgements ga
          ON ga.guide_id = g.id
          AND ga.user_id = ?

        WHERE g.status = 'active'

        ORDER BY g.created_at DESC

        LIMIT 1
        `,
        [userId, userId]
      );
    }

    // ==================================================
    // TEAM LEAD
    // Gets latest guide from projects assigned to
    // members belonging to the logged-in Team Lead.
    // ==================================================

    else if (role === "teamLead") {
      [guides] = await db.query(
        `
        SELECT
          g.id,
          g.project_id,
          g.title,
          g.version,
          g.description,
          g.updated_date,
          g.effective_date,
          g.file_url,
          g.status,
          g.created_at,

          p.project_name,

          CASE
            WHEN ga.id IS NULL THEN 0
            ELSE 1
          END AS acknowledged

        FROM guides g

        JOIN projects p
          ON p.id = g.project_id

        JOIN user_project_assignments upa
          ON upa.project_id = g.project_id

        JOIN team_members tm
          ON tm.member_id = upa.user_id
          AND tm.team_lead_id = ?

        LEFT JOIN guide_acknowledgements ga
          ON ga.guide_id = g.id
          AND ga.user_id = ?

        WHERE g.status = 'active'

        GROUP BY
          g.id,
          g.project_id,
          g.title,
          g.version,
          g.description,
          g.updated_date,
          g.effective_date,
          g.file_url,
          g.status,
          g.created_at,
          p.project_name,
          ga.id

        ORDER BY g.created_at DESC

        LIMIT 1
        `,
        [userId, userId]
      );
    }

    // ==================================================
    // UNSUPPORTED ROLE
    // ==================================================

    else {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access guides",
      });
    }

    // ==================================================
    // NO GUIDE FOUND
    // ==================================================

    if (guides.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active guide found",
      });
    }

    // ==================================================
    // SUCCESS
    // ==================================================

    return res.status(200).json({
      success: true,
      guide: guides[0],
    });

  } catch (error) {
    console.error("Get Latest Guide Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load guide",
      error: error.message,
    });
  }
};


// ======================================================
// ACKNOWLEDGE GUIDE
// Works separately for each logged-in user.
//
// Priya acknowledging a guide does NOT automatically
// acknowledge it for Rohan.
// ======================================================

const acknowledgeGuide = async (req, res) => {
  try {
    const userId = req.user.id;
    const guideId = req.params.id;

    // Check whether guide exists and is active
    const [guides] = await db.query(
      `
      SELECT id
      FROM guides
      WHERE id = ?
        AND status = 'active'
      `,
      [guideId]
    );

    if (guides.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Guide not found",
      });
    }

    // Check whether this user already acknowledged it
    const [existing] = await db.query(
      `
      SELECT id
      FROM guide_acknowledgements
      WHERE guide_id = ?
        AND user_id = ?
      `,
      [guideId, userId]
    );

    if (existing.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Guide already acknowledged",
      });
    }

    // Save acknowledgement for this user
    await db.query(
      `
      INSERT INTO guide_acknowledgements
      (
        guide_id,
        user_id,
        acknowledged_at
      )
      VALUES (?, ?, NOW())
      `,
      [guideId, userId]
    );

    return res.status(200).json({
      success: true,
      message: "Guide acknowledged successfully",
    });

  } catch (error) {
    console.error("Acknowledge Guide Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to acknowledge guide",
      error: error.message,
    });
  }
};


// Gets guide version history for an allowed project
const getGuideHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const projectId = req.params.projectId;

    let accessRows = [];

    // Checks project access for Indexer
    if (role === "indexer") {
      [accessRows] = await db.query(
        `
        SELECT id
        FROM user_project_assignments
        WHERE user_id = ?
          AND project_id = ?
        LIMIT 1
        `,
        [userId, projectId]
      );
    }

    // Checks project access for Team Lead through team members
    else if (role === "teamLead") {
      [accessRows] = await db.query(
        `
        SELECT tm.id
        FROM team_members tm

        JOIN user_project_assignments upa
          ON upa.user_id = tm.member_id

        WHERE tm.team_lead_id = ?
          AND upa.project_id = ?

        LIMIT 1
        `,
        [userId, projectId]
      );
    }

    if (accessRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view this guide history",
      });
    }

    const [history] = await db.query(
      `
      SELECT
        g.id,
        g.project_id,
        g.title,
        g.version,
        g.description,
        g.updated_date,
        g.effective_date,
        g.file_url,
        g.status,
        g.created_at,
        p.project_name
      FROM guides g

      JOIN projects p
        ON p.id = g.project_id

      WHERE g.project_id = ?

      ORDER BY g.created_at DESC
      `,
      [projectId]
    );

    return res.status(200).json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error("Guide History Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load guide history",
      error: error.message,
    });
  }
};

// Downloads a guide file if the logged-in user has access
const downloadGuide = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const guideId = req.params.id;

    let guides = [];

    if (role === "indexer") {
      [guides] = await db.query(
        `
        SELECT
          g.id,
          g.file_url
        FROM guides g

        JOIN user_project_assignments upa
          ON upa.project_id = g.project_id

        WHERE g.id = ?
          AND upa.user_id = ?

        LIMIT 1
        `,
        [guideId, userId]
      );
    }

    else if (role === "teamLead") {
      [guides] = await db.query(
        `
        SELECT
          g.id,
          g.file_url

        FROM guides g

        JOIN user_project_assignments upa
          ON upa.project_id = g.project_id

        JOIN team_members tm
          ON tm.member_id = upa.user_id

        WHERE g.id = ?
          AND tm.team_lead_id = ?

        LIMIT 1
        `,
        [guideId, userId]
      );
    }

    if (guides.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to download this guide",
      });
    }

    if (!guides[0].file_url) {
      return res.status(404).json({
        success: false,
        message: "Guide file is not available",
      });
    }

    // Builds the absolute guide file path
const filePath = path.resolve(
  process.cwd(),
  guides[0].file_url
);

console.log("Downloading guide from:", filePath);

// Downloads the guide PDF
return res.download(filePath);


    return res.download(filePath);
  } catch (error) {
    console.error("Guide Download Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to download guide",
      error: error.message,
    });
  }
};
// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getLatestGuide,
  acknowledgeGuide,
   getGuideHistory,
    downloadGuide,
};