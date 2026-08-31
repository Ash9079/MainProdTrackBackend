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
    const [guides] = await db.query(
      `
      SELECT
        gv.version_id AS id,
        gv.version_id,
        g.guide_id,
        g.project_id,
        g.title,
        p.project_name,
        gv.version_label AS version,
        gv.change_summary AS description,
        gv.uploaded_at AS updated_date,
        gv.effective_date,
        gv.requires_ack,

        CASE
          WHEN ga.status = 'read' THEN 1
          ELSE 0
        END AS acknowledged

      FROM project_assignment pa

      JOIN project p
        ON p.project_id = pa.project_id

      JOIN guide g
        ON g.project_id = p.project_id

      JOIN guide_version gv
        ON gv.guide_id = g.guide_id

      LEFT JOIN guide_acknowledgement ga
        ON ga.version_id = gv.version_id
       AND ga.user_id = pa.user_id

      WHERE pa.user_id = ?
        AND p.status = 'active'
        AND gv.is_latest = 1

      ORDER BY gv.uploaded_at DESC, gv.version_id DESC
      `,
      [req.user.id]
    );

    return res.json({
      success: true,
      count: guides.length,
      guides,
      guide: guides[0] || null,
    });
  } catch (error) {
    console.error("Get Latest Guide Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load indexing guides",
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
    const versionId = Number(req.params.id);

    if (!Number.isSafeInteger(versionId) || versionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid guide version ID is required",
      });
    }

    // Only allow the latest guide for an assigned, active project.
    const [versions] = await db.query(
      `
      SELECT gv.version_id
      FROM guide_version gv

      JOIN guide g
        ON g.guide_id = gv.guide_id

      JOIN project p
        ON p.project_id = g.project_id

      JOIN project_assignment pa
        ON pa.project_id = p.project_id

      WHERE gv.version_id = ?
        AND gv.is_latest = 1
        AND p.status = 'active'
        AND pa.user_id = ?

      LIMIT 1
      `,
      [versionId, userId]
    );

    if (versions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Latest assigned guide version not found",
      });
    }

    // Create an acknowledgement or change an existing unread row to read.
    // Repeated requests preserve the original acknowledgement time.
    await db.query(
      `
      INSERT INTO guide_acknowledgement
      (
        version_id,
        user_id,
        status,
        acknowledged_at
      )
      VALUES (?, ?, 'read', NOW())

      ON DUPLICATE KEY UPDATE
        acknowledged_at = IF(
          status = 'read',
          COALESCE(acknowledged_at, NOW()),
          NOW()
        ),
        status = 'read'
      `,
      [versionId, userId]
    );

    return res.status(200).json({
      success: true,
      message: "Guide acknowledged successfully",
      versionId,
    });
  } catch (error) {
    console.error("Acknowledge Guide Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to acknowledge guide",
    });
  }
};


// Gets all guide versions for an assigned project.
const getGuideHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = Number(req.params.projectId);

    if (!["indexer", "teamLead"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view guide history",
      });
    }

    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid project ID is required",
      });
    }

    // Same assignment rule used by the latest-guide endpoint.
    const [assignments] = await db.query(
      `
      SELECT assignment_id
      FROM project_assignment
      WHERE user_id = ?
        AND project_id = ?
      LIMIT 1
      `,
      [userId, projectId]
    );

    if (assignments.length === 0) {
      return res.status(403).json({
        success: false,
        message: "This project is not assigned to you",
      });
    }

    const [history] = await db.query(
      `
      SELECT
        gv.version_id AS id,
        gv.version_id,
        g.guide_id,
        g.project_id,
        g.title,
        p.project_name,

        gv.version_label AS version,
        gv.change_summary AS description,
        gv.uploaded_at AS updated_date,
        gv.effective_date,
        gv.is_latest,
        gv.requires_ack,

        CASE
          WHEN gv.file_path IS NOT NULL
            AND TRIM(gv.file_path) <> ''
          THEN 1
          ELSE 0
        END AS has_file,

        CASE
          WHEN ga.status = 'read' THEN 1
          ELSE 0
        END AS acknowledged,

        ga.acknowledged_at

      FROM guide g

      JOIN guide_version gv
        ON gv.guide_id = g.guide_id

      JOIN project p
        ON p.project_id = g.project_id

      LEFT JOIN guide_acknowledgement ga
        ON ga.version_id = gv.version_id
       AND ga.user_id = ?

      WHERE g.project_id = ?

      ORDER BY
        gv.uploaded_at DESC,
        gv.version_id DESC
      `,
      [userId, projectId]
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
    });
  }
};

// Download a guide version for an assigned project.
const downloadGuide = async (req, res, next) => {
  const path = require("path");
  const fs = require("fs/promises");

  try {
    const userId = req.user.id;
    const versionId = Number(req.params.id);

    if (!["indexer", "teamLead"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to download guides",
      });
    }

    if (!Number.isSafeInteger(versionId) || versionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid guide version ID is required",
      });
    }

    const [guides] = await db.query(
      `
      SELECT
        gv.version_id,
        gv.file_path
      FROM guide_version gv

      JOIN guide g
        ON g.guide_id = gv.guide_id

      JOIN project_assignment pa
        ON pa.project_id = g.project_id

      WHERE gv.version_id = ?
        AND pa.user_id = ?

      LIMIT 1
      `,
      [versionId, userId]
    );

    if (guides.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Assigned guide version not found",
      });
    }

    const storedPath = guides[0].file_path;

    if (!storedPath) {
      return res.status(404).json({
        success: false,
        message: "Guide file path is not configured",
      });
    }

    // This controller must be in backend/controllers/.
    const backendRoot = path.resolve(__dirname, "..");
    const guidesFolder = path.join(backendRoot, "uploads", "guides");
    const filePath = path.resolve(backendRoot, storedPath);

    // Only allow files inside uploads/guides.
      const isInside = (folder, file) => {
        const relative = path.relative(folder, file);

        return (
          relative !== "" &&
          relative !== ".." &&
          !relative.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relative)
        );
      };

      if (!isInside(guidesFolder, filePath)) {
        return res.status(403).json({
          success: false,
          message: "Invalid guide file location",
        });
      }

      // Also check the actual locations in case symbolic links are used.
      const realFolder = await fs.realpath(guidesFolder);
      const realFile = await fs.realpath(filePath);

      if (!isInside(realFolder, realFile)) {
        return res.status(403).json({
          success: false,
          message: "Invalid guide file location",
        });
      }

      const fileInfo = await fs.stat(realFile);

      if (!fileInfo.isFile()) {
        return res.status(404).json({
          success: false,
          message: "Guide file is not available",
        });
      }

      return res.download(
        realFile,
        path.basename(realFile),
        (error) => {
          if (!error) return;

          console.error("Guide Download Error:", error);

          if (res.headersSent) {
            return next(error);
          }

          return res.status(error.statusCode === 404 ? 404 : 500).json({
            success: false,
            message: "Could not send the guide file",
          });
        }
      );
    } catch (error) {
      console.error("Download Guide Error:", error);

      const missingFile = ["ENOENT", "ENOTDIR"].includes(error.code);

      return res.status(missingFile ? 404 : 500).json({
        success: false,
        message: missingFile
          ? "Guide PDF was not found in uploads/guides"
          : "Failed to download guide",
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