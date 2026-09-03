// Imports the shared MySQL database connection.
const db = require("../config/db");

// Imports Node's path module for safely resolving uploaded guide files.
const path = require("path");

// ======================================================
// GET LATEST ACTIVE GUIDE
// Works for Indexer and Team Lead.
// ======================================================

const getLatestGuide = async (req, res) => {
  try {
    // Gets the latest guides assigned to the currently logged-in user.
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

    // Returns all latest guides available to the logged-in user.
    return res.json({
      success: true,
      count: guides.length,
      guides,
      guide: guides[0] || null,
    });
  } catch (error) {
    // Logs the actual database error for debugging.
    console.error("Get Latest Guide Error:", error);

    // Returns a safe server error response.
    return res.status(500).json({
      success: false,
      message: "Failed to load indexing guides",
    });
  }
};

// ======================================================
// ACKNOWLEDGE GUIDE
// Saves acknowledgement separately for each user.
// ======================================================

const acknowledgeGuide = async (req, res) => {
  try {
    // Gets the currently logged-in user's ID.
    const userId = req.user.id;

    // Converts the guide version parameter into a number.
    const versionId = Number(req.params.id);

    // Validates the supplied guide version ID.
    if (!Number.isSafeInteger(versionId) || versionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid guide version ID is required",
      });
    }

    // Checks that the guide is the latest version of a project assigned to this user.
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

    // Prevents acknowledgement of a guide that is unavailable to this user.
    if (versions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Latest assigned guide version not found",
      });
    }

    // Inserts acknowledgement or updates an existing unread acknowledgement.
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

    // Returns successful acknowledgement response.
    return res.status(200).json({
      success: true,
      message: "Guide acknowledged successfully",
      versionId,
    });
  } catch (error) {
    // Logs acknowledgement errors in the backend terminal.
    console.error("Acknowledge Guide Error:", error);

    // Returns a safe server error.
    return res.status(500).json({
      success: false,
      message: "Failed to acknowledge guide",
    });
  }
};

// ======================================================
// GET GUIDE HISTORY
// Gets all versions for an assigned project.
// ======================================================

const getGuideHistory = async (req, res) => {
  try {
    // Gets the currently logged-in user ID.
    const userId = req.user.id;

    // Reads the requested project ID.
    const projectId = Number(req.params.projectId);

    // Allows only Indexer and Team Lead roles.
    if (!["indexer", "teamLead"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view guide history",
      });
    }

    // Validates the project ID.
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid project ID is required",
      });
    }

    // Checks whether the project is assigned to the current user.
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

    // Prevents access to unassigned projects.
    if (assignments.length === 0) {
      return res.status(403).json({
        success: false,
        message: "This project is not assigned to you",
      });
    }

    // Gets every guide version belonging to this assigned project.
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

    // Returns the complete guide version history.
    return res.status(200).json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    // Logs history loading errors.
    console.error("Guide History Error:", error);

    // Returns a safe error response.
    return res.status(500).json({
      success: false,
      message: "Failed to load guide history",
    });
  }
};

// ======================================================
// DOWNLOAD GUIDE
// Downloads a guide version for an assigned project.
// ======================================================

const downloadGuide = async (req, res, next) => {
  // Imports the promise-based filesystem API for secure file checks.
  const fs = require("fs/promises");

  try {
    // Gets the logged-in user ID.
    const userId = req.user.id;

    // Gets the requested version ID.
    const versionId = Number(req.params.id);

    // Allows downloads only for Indexers and Team Leads.
    if (!["indexer", "teamLead"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to download guides",
      });
    }

    // Validates the version ID.
    if (!Number.isSafeInteger(versionId) || versionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid guide version ID is required",
      });
    }

    // Gets the guide file only when its project is assigned to the current user.
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

    // Returns 404 when the version is unavailable to the user.
    if (guides.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Assigned guide version not found",
      });
    }

    // Gets the stored relative file path.
    const storedPath = guides[0].file_path;

    // Ensures that a file path exists in the database.
    if (!storedPath) {
      return res.status(404).json({
        success: false,
        message: "Guide file path is not configured",
      });
    }

    // Resolves the backend application root folder.
    const backendRoot = path.resolve(__dirname, "..");

    // Defines the only folder from which guide files may be downloaded.
    const guidesFolder = path.join(backendRoot, "uploads", "guides");

    // Resolves the database file path into an absolute path.
    const filePath = path.resolve(backendRoot, storedPath);

    // Checks whether a file is safely located inside the allowed guide folder.
    const isInside = (folder, file) => {
      const relative = path.relative(folder, file);

      return (
        relative !== "" &&
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      );
    };

    // Prevents path traversal outside uploads/guides.
    if (!isInside(guidesFolder, filePath)) {
      return res.status(403).json({
        success: false,
        message: "Invalid guide file location",
      });
    }

    // Resolves real paths to protect against symbolic-link based traversal.
    const realFolder = await fs.realpath(guidesFolder);

    // Resolves the real uploaded file location.
    const realFile = await fs.realpath(filePath);

    // Prevents symbolic links from resolving outside the allowed folder.
    if (!isInside(realFolder, realFile)) {
      return res.status(403).json({
        success: false,
        message: "Invalid guide file location",
      });
    }

    // Reads file information before attempting download.
    const fileInfo = await fs.stat(realFile);

    // Rejects paths that do not point to a regular file.
    if (!fileInfo.isFile()) {
      return res.status(404).json({
        success: false,
        message: "Guide file is not available",
      });
    }

    // Sends the PDF file to the client.
    return res.download(
      realFile,
      path.basename(realFile),
      (error) => {
        // Stops when the download completed successfully.
        if (!error) return;

        // Logs download errors.
        console.error("Guide Download Error:", error);

        // Passes errors to Express if response headers were already sent.
        if (res.headersSent) {
          return next(error);
        }

        // Returns a safe download error.
        return res.status(error.statusCode === 404 ? 404 : 500).json({
          success: false,
          message: "Could not send the guide file",
        });
      }
    );
  } catch (error) {
    // Logs the complete download error.
    console.error("Download Guide Error:", error);

    // Detects missing filesystem paths.
    const missingFile = ["ENOENT", "ENOTDIR"].includes(error.code);

    // Returns an appropriate file or server error.
    return res.status(missingFile ? 404 : 500).json({
      success: false,
      message: missingFile
        ? "Guide PDF was not found in uploads/guides"
        : "Failed to download guide",
    });
  }
};

// ======================================================
// GET GUIDE MANAGER LIST
// Used by Core Team and Administrator.
// Counts ACTIVE INDEXERS only.
// ======================================================

const getGuideManagerList = async (req, res) => {
  try {
    // Gets every latest guide version and calculates active Indexer acknowledgement compliance.
    const [guides] = await db.query(`
      SELECT
        g.guide_id,
        g.project_id,
        g.title AS guide,
        p.project_name AS project,

        gv.version_id,
        gv.version_label AS version,
        gv.uploaded_at AS updated,
        gv.requires_ack,

        COUNT(
          DISTINCT CASE
            WHEN r.code = 'indexer'
              AND u.status = 'active'
            THEN pa.user_id
            ELSE NULL
          END
        ) AS total_assigned,

        COUNT(
          DISTINCT CASE
            WHEN r.code = 'indexer'
              AND u.status = 'active'
              AND ga.status = 'read'
            THEN ga.user_id
            ELSE NULL
          END
        ) AS acknowledged_count,

        CASE
          WHEN COUNT(
            DISTINCT CASE
              WHEN r.code = 'indexer'
                AND u.status = 'active'
              THEN pa.user_id
              ELSE NULL
            END
          ) = 0
          THEN 0

          ELSE ROUND(
            COUNT(
              DISTINCT CASE
                WHEN r.code = 'indexer'
                  AND u.status = 'active'
                  AND ga.status = 'read'
                THEN ga.user_id
                ELSE NULL
              END
            )
            /
            COUNT(
              DISTINCT CASE
                WHEN r.code = 'indexer'
                  AND u.status = 'active'
                THEN pa.user_id
                ELSE NULL
              END
            )
            * 100
          )
        END AS acknowledgement_percentage,

        CASE
          WHEN p.status = 'active' THEN 'ACTIVE'
          ELSE 'INACTIVE'
        END AS status

      FROM guide g

      JOIN project p
        ON p.project_id = g.project_id

      JOIN guide_version gv
        ON gv.guide_id = g.guide_id
       AND gv.is_latest = 1

      LEFT JOIN project_assignment pa
        ON pa.project_id = g.project_id

      LEFT JOIN users u
        ON u.user_id = pa.user_id

      LEFT JOIN role r
        ON r.role_id = u.role_id

      LEFT JOIN guide_acknowledgement ga
        ON ga.version_id = gv.version_id
       AND ga.user_id = pa.user_id

      GROUP BY
        g.guide_id,
        g.project_id,
        g.title,
        p.project_name,
        p.status,
        gv.version_id,
        gv.version_label,
        gv.uploaded_at,
        gv.requires_ack

      ORDER BY
        gv.uploaded_at DESC,
        gv.version_id DESC
    `);

    // Returns the Guide Manager table data.
    return res.status(200).json({
      success: true,
      count: guides.length,
      guides,
    });
  } catch (error) {
    // Logs Guide Manager database errors.
    console.error("Get Guide Manager List Error:", error);

    // Returns a safe server error.
    return res.status(500).json({
      success: false,
      message: "Failed to load Guide Manager",
    });
  }
};

// ======================================================
// GET GUIDE COMPLIANCE
// Shows acknowledgement details for ACTIVE INDEXERS only.
// ======================================================

const getGuideCompliance = async (req, res) => {
  try {
    // Reads the guide version ID from the URL.
    const versionId = Number(req.params.id);

    // Validates the supplied version ID.
    if (!Number.isSafeInteger(versionId) || versionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid guide version ID",
      });
    }

    // Gets guide, project and selected version information.
    const [versionRows] = await db.query(
      `
      SELECT
        gv.version_id,
        gv.version_label,
        gv.requires_ack,
        gv.uploaded_at,

        g.guide_id,
        g.title AS guide,

        p.project_id,
        p.project_name AS project

      FROM guide_version gv

      JOIN guide g
        ON g.guide_id = gv.guide_id

      JOIN project p
        ON p.project_id = g.project_id

      WHERE gv.version_id = ?

      LIMIT 1
      `,
      [versionId]
    );

    // Returns 404 when the guide version does not exist.
    if (versionRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Guide version not found",
      });
    }

    // Stores the selected version information.
    const guideVersion = versionRows[0];

    // Gets acknowledgement details only for ACTIVE INDEXERS assigned to this project.
    const [users] = await db.query(
      `
      SELECT
        u.user_id,
        u.emp_code,
        u.full_name,
        u.email,

        CASE
          WHEN ga.status = 'read' THEN 'ACKNOWLEDGED'
          ELSE 'PENDING'
        END AS acknowledgement_status,

        ga.acknowledged_at

      FROM project_assignment pa

      JOIN users u
        ON u.user_id = pa.user_id

      JOIN role r
        ON r.role_id = u.role_id

      LEFT JOIN guide_acknowledgement ga
        ON ga.user_id = u.user_id
       AND ga.version_id = ?

      WHERE pa.project_id = ?
        AND r.code  = 'indexer'
        AND u.status = 'active'

      ORDER BY
        CASE
          WHEN ga.status = 'read' THEN 1
          ELSE 0
        END,

        u.full_name ASC
      `,
      [versionId, guideVersion.project_id]
    );

    // Counts active Indexers who have acknowledged the guide.
    const acknowledgedCount = users.filter(
      (user) =>
        user.acknowledgement_status === "ACKNOWLEDGED"
    ).length;

    // Calculates active Indexers who still have acknowledgement pending.
    const pendingCount =
      users.length - acknowledgedCount;

    // Calculates acknowledgement percentage.
    const acknowledgementPercentage =
      users.length === 0
        ? 0
        : Math.round(
            (acknowledgedCount / users.length) * 100
          );

    // Returns guide information and employee-level compliance.
    return res.status(200).json({
      success: true,

      guide: {
        guide_id: guideVersion.guide_id,
        version_id: guideVersion.version_id,
        project_id: guideVersion.project_id,
        project: guideVersion.project,
        guide: guideVersion.guide,
        version: guideVersion.version_label,
        requires_ack: guideVersion.requires_ack,
        uploaded_at: guideVersion.uploaded_at,
      },

      compliance: {
        total_assigned: users.length,
        acknowledged: acknowledgedCount,
        pending: pendingCount,
        acknowledgement_percentage:
          acknowledgementPercentage,
      },

      users,
    });
  } catch (error) {
    // Logs compliance loading errors.
    console.error("Get Guide Compliance Error:", error);

    // Returns a safe server error.
    return res.status(500).json({
      success: false,
      message: "Failed to load guide compliance",
    });
  }
};

// ======================================================
// UPLOAD NEW GUIDE VERSION
// Used by Core Team and Administrator.
// Creates acknowledgement rows for ACTIVE INDEXERS only.
// ======================================================

const uploadGuideVersion = async (req, res) => {
  // Gets a dedicated database connection for the transaction.
  const connection = await db.getConnection();

  // Imports the promise-based filesystem API for uploaded-file cleanup.
  const fs = require("fs/promises");

  try {
    // Gets the currently logged-in user's ID.
    const uploadedBy = req.user.id;

    // Reads the guide ID from multipart form-data.
    const guideId = Number(req.body.guideId);

    // Reads and cleans the new version label.
    const version = req.body.version?.trim();

    // Reads the optional change summary.
    const changeSummary =
      req.body.changeSummary?.trim() || null;

    // Reads the optional guide effective date.
    const effectiveDate =
      req.body.effectiveDate || null;

    // Converts the form-data acknowledgement value into 1 or 0.
    const requiresAck =
      req.body.requiresAck === undefined
        ? 1
        : ["1", "true", "yes"].includes(
            String(req.body.requiresAck).toLowerCase()
          )
        ? 1
        : 0;

    // Validates the selected guide ID.
    if (!Number.isSafeInteger(guideId) || guideId <= 0) {
      // Deletes the uploaded file when validation fails.
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      return res.status(400).json({
        success: false,
        message: "A valid guide ID is required",
      });
    }

    // Validates the version label.
    if (!version) {
      // Deletes the uploaded file when validation fails.
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      return res.status(400).json({
        success: false,
        message: "Version is required",
      });
    }

    // Ensures that Multer received a PDF.
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Guide PDF file is required",
      });
    }

    // Checks whether the selected guide exists.
    const [guideRows] = await connection.query(
      `
      SELECT
        g.guide_id,
        g.project_id,
        g.title,
        p.project_name

      FROM guide g

      JOIN project p
        ON p.project_id = g.project_id

      WHERE g.guide_id = ?

      LIMIT 1
      `,
      [guideId]
    );

    // Prevents uploading a version for a nonexistent guide.
    if (guideRows.length === 0) {
      // Deletes the already-uploaded PDF because the database operation cannot continue.
      await fs.unlink(req.file.path).catch(() => {});

      return res.status(404).json({
        success: false,
        message: "Guide not found",
      });
    }

    // Checks whether this version label already exists for the same guide.
    const [duplicateVersions] =
      await connection.query(
        `
        SELECT version_id

        FROM guide_version

        WHERE guide_id = ?
          AND version_label = ?

        LIMIT 1
        `,
        [guideId, version]
      );

    // Prevents duplicate version labels for the same guide.
    if (duplicateVersions.length > 0) {
      // Removes the unused uploaded PDF.
      await fs.unlink(req.file.path).catch(() => {});

      return res.status(409).json({
        success: false,
        message: "This guide version already exists",
      });
    }

    // Starts the database transaction.
    await connection.beginTransaction();

    // Marks every existing version of this guide as no longer latest.
    await connection.query(
      `
      UPDATE guide_version

      SET is_latest = 0

      WHERE guide_id = ?
      `,
      [guideId]
    );

    // Stores the path relative to the backend root for the download API.
    const storedFilePath =
      `uploads/guides/${req.file.filename}`;

    // Inserts the newly uploaded version as the latest guide version.
    const [insertResult] =
      await connection.query(
        `
        INSERT INTO guide_version
        (
          guide_id,
          version_label,
          file_path,
          change_summary,
          is_latest,
          requires_ack,
          effective_date,
          uploaded_by
        )

        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        `,
        [
          guideId,
          version,
          storedFilePath,
          changeSummary,
          requiresAck,
          effectiveDate,
          uploadedBy,
        ]
      );

    // Stores the newly generated version ID.
    const versionId = insertResult.insertId;

    // Creates pending acknowledgements only when this version requires acknowledgement.
    if (requiresAck === 1) {
      // Inserts unread acknowledgement rows only for ACTIVE INDEXERS assigned to this project.
      await connection.query(
        `
        INSERT INTO guide_acknowledgement
        (
          version_id,
          user_id,
          status,
          acknowledged_at
        )

        SELECT
          ?,
          pa.user_id,
          'unread',
          NULL

        FROM project_assignment pa

        JOIN users u
          ON u.user_id = pa.user_id

        JOIN role r
          ON r.role_id = u.role_id

        WHERE pa.project_id = ?
          AND r.code  = 'indexer'
          AND u.status = 'active'
        `,
        [
          versionId,
          guideRows[0].project_id,
        ]
      );
    }

    // Commits all version and acknowledgement changes together.
    await connection.commit();

    // Returns the newly created guide version.
    return res.status(201).json({
      success: true,
      message:
        "New guide version uploaded successfully",

      guide: {
        guide_id: guideId,
        version_id: versionId,
        project_id: guideRows[0].project_id,
        project: guideRows[0].project_name,
        guide: guideRows[0].title,
        version,
        file_path: storedFilePath,
        requires_ack: requiresAck,
        effective_date: effectiveDate,
      },
    });
  } catch (error) {
    // Rolls back all database modifications if anything fails.
    await connection.rollback();

    // Removes the uploaded file if the database transaction fails.
    if (req.file?.path) {
      try {
        // Deletes the orphaned PDF.
        await fs.unlink(req.file.path);
      } catch (fileError) {
        // Logs file cleanup errors separately.
        console.error(
          "Guide Upload File Cleanup Error:",
          fileError
        );
      }
    }

    // Logs the complete upload error.
    console.error(
      "Upload Guide Version Error:",
      error
    );

    // Returns a safe server error response.
    return res.status(500).json({
      success: false,
      message: "Failed to upload guide version",
    });
  } finally {
    // Releases the dedicated connection back to the connection pool.
    connection.release();
  }
};

// ======================================================
// GET PENDING ACK GUIDE
// Returns the single latest guide version that the
// logged-in indexer has NOT yet acknowledged.
// Used by the login popup (GuideUpdateModal).
// ======================================================

const getPendingAckGuide = async (req, res) => {
  try {
    // Gets the currently logged-in user's ID.
    const userId = req.user.id;

    // Finds the most recently uploaded guide that:
    //   • is the latest version of its guide
    //   • belongs to a project assigned to this user
    //   • requires acknowledgement
    //   • has NOT yet been acknowledged by this user
    const [rows] = await db.query(
      `
      SELECT
        gv.version_id,
        g.guide_id,
        g.title          AS guide_title,
        p.project_name,
        gv.version_label AS version,
        gv.change_summary,
        gv.uploaded_at,
        gv.effective_date,
        gv.requires_ack

      FROM project_assignment pa

      JOIN project p
        ON p.project_id = pa.project_id

      JOIN guide g
        ON g.project_id = p.project_id

      JOIN guide_version gv
        ON gv.guide_id = g.guide_id

      LEFT JOIN guide_acknowledgement ga
        ON ga.version_id = gv.version_id
       AND ga.user_id    = pa.user_id

      WHERE pa.user_id       = ?
        AND p.status         = 'active'
        AND gv.is_latest     = 1
        AND gv.requires_ack  = 1
        AND (ga.status IS NULL OR ga.status <> 'read')

      ORDER BY gv.uploaded_at DESC, gv.version_id DESC

      LIMIT 1
      `,
      [userId]
    );

    // No pending guide found — modal should not open.
    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        hasPending: false,
        guide: null,
      });
    }

    const guide = rows[0];

    // Formats the uploaded date for the frontend.
    const formatDate = (value) => {
      if (!value) return null;
      return new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    };

    // Returns the unacknowledged guide details.
    return res.status(200).json({
      success: true,
      hasPending: true,
      guide: {
        version_id:    guide.version_id,
        guide_id:      guide.guide_id,
        title:         guide.guide_title,
        project_name:  guide.project_name,
        version:       guide.version,
        change_summary: guide.change_summary,
        uploaded_at:   formatDate(guide.uploaded_at),
        effective_date: formatDate(guide.effective_date),
        requires_ack:  guide.requires_ack,
      },
    });
  } catch (error) {
    // Logs the full error for debugging.
    console.error("Get Pending Ack Guide Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load pending guide",
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

// Exports every shared guide controller.
module.exports = {
  getLatestGuide,
  acknowledgeGuide,
  getGuideHistory,
  downloadGuide,
  getGuideManagerList,
  getGuideCompliance,
  uploadGuideVersion,
  getPendingAckGuide,
};