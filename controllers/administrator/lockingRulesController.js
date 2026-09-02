// Imports the shared MySQL database connection.
const db = require("../../config/db");

// Defines the four application settings used by the Locking Rules screen.
const LOCKING_SETTING_KEYS = [
  "draft_entry_rule",
  "submitted_entry_rule",
  "locked_entry_rule",
  "correction_approver_rule",
];

// Gets all Administrator Daily Entry Locking Rules.
const getLockingRules = async (req, res) => {
  try {
    // Creates SQL placeholders for the four setting keys.
    const placeholders = LOCKING_SETTING_KEYS.map(() => "?").join(", ");

    // Gets the four global locking rules from app_setting.
    const [settingRows] = await db.query(
      `
        SELECT
          setting_key,
          setting_value,
          description,
          modified_by,
          modified_at
        FROM app_setting
        WHERE setting_key IN (${placeholders})
      `,
      LOCKING_SETTING_KEYS
    );

    // Converts the setting rows into a simple key/value object for the frontend.
    const globalRules = {};

    // Adds every returned setting to the global rules object.
    settingRows.forEach((setting) => {
      globalRules[setting.setting_key] = setting.setting_value;
    });

    // Gets project-specific auto-lock and grace-period settings.
    const [projectRows] = await db.query(
      `
        SELECT
          project_id,
          project_code,
          project_name,
          auto_lock_time,
          grace_minutes,
          status
        FROM project
        WHERE status = 'active'
        ORDER BY project_name ASC
      `
    );

    // Returns both parts required by the Administrator Locking Rules screen.
    return res.status(200).json({
      success: true,

      globalRules: {
        draftEntryRule:
          globalRules.draft_entry_rule || "editable_by_indexer",

        submittedEntryRule:
          globalRules.submitted_entry_rule || "read_only_for_indexer",

        lockedEntryRule:
          globalRules.locked_entry_rule || "correction_request_required",

        correctionApproverRule:
          globalRules.correction_approver_rule ||
          "team_lead_then_core_team",
      },

      projects: projectRows.map((project) => ({
        projectId: project.project_id,
        projectCode: project.project_code,
        projectName: project.project_name,
        autoLockTime: project.auto_lock_time,
        graceMinutes: project.grace_minutes,
        status: project.status,
      })),
    });
  } catch (error) {
    // Logs the complete error in the backend terminal for debugging.
    console.error("Get Locking Rules Error:", error);

    // Returns a safe server-error response.
    return res.status(500).json({
      success: false,
      message: "Failed to load locking rules",
      error: error.message,
    });
  }
};

// Updates the Administrator global locking rules and project auto-lock settings.
const updateLockingRules = async (req, res) => {
  // Gets a dedicated database connection so all updates can run in one transaction.
  const connection = await db.getConnection();

  try {
    // Gets the global rules and project rules sent by the frontend.
    const { globalRules, projects } = req.body;

    // Validates that the required global rules object was provided.
    if (!globalRules || typeof globalRules !== "object") {
      return res.status(400).json({
        success: false,
        message: "Global rules are required",
      });
    }

    // Validates that project rules were provided as an array.
    if (!Array.isArray(projects)) {
      return res.status(400).json({
        success: false,
        message: "Project rules must be an array",
      });
    }

    // Gets the logged-in Administrator user ID from the JWT.
    const modifiedBy = req.user.id;

    // Creates the mapping between frontend field names and database setting keys.
    const settings = [
      {
        key: "draft_entry_rule",
        value: globalRules.draftEntryRule,
      },
      {
        key: "submitted_entry_rule",
        value: globalRules.submittedEntryRule,
      },
      {
        key: "locked_entry_rule",
        value: globalRules.lockedEntryRule,
      },
      {
        key: "correction_approver_rule",
        value: globalRules.correctionApproverRule,
      },
    ];

    // Checks that every required global rule contains a value.
    const missingSetting = settings.find(
      (setting) =>
        typeof setting.value !== "string" ||
        setting.value.trim() === ""
    );

    // Stops the request when any required global rule is missing.
    if (missingSetting) {
      return res.status(400).json({
        success: false,
        message: `Missing value for ${missingSetting.key}`,
      });
    }

    // Starts the transaction so all settings are saved together.
    await connection.beginTransaction();

    // Updates each global rule in the existing app_setting table.
    for (const setting of settings) {
      await connection.query(
        `
          UPDATE app_setting
          SET
            setting_value = ?,
            modified_by = ?
          WHERE setting_key = ?
        `,
        [setting.value, modifiedBy, setting.key]
      );
    }

    // Updates every project-specific auto-lock time and grace period.
    for (const project of projects) {
      // Validates the project ID before updating the database.
      if (!project.projectId) {
        throw new Error("Project ID is required");
      }

      // Converts the grace period into a number.
      const graceMinutes = Number(project.graceMinutes);

      // Validates the grace period before saving it.
      if (
        !Number.isInteger(graceMinutes) ||
        graceMinutes < 0 ||
        graceMinutes > 65535
      ) {
        throw new Error(
          `Invalid grace period for project ${project.projectId}`
        );
      }

      // Updates the existing project's auto-lock time and grace period.
      const [projectResult] = await connection.query(
        `
          UPDATE project
          SET
            auto_lock_time = ?,
            grace_minutes = ?
          WHERE project_id = ?
            AND status = 'active'
        `,
        [
          project.autoLockTime || null,
          graceMinutes,
          project.projectId,
        ]
      );

      // Stops the transaction when the requested active project does not exist.
      if (projectResult.affectedRows === 0) {
        throw new Error(
          `Active project ${project.projectId} was not found`
        );
      }
    }

    // Commits all global and project rule changes.
    await connection.commit();

    // Returns a successful response after everything is saved.
    return res.status(200).json({
      success: true,
      message: "Locking rules updated successfully",
    });
  } catch (error) {
    // Rolls back every change when any update fails.
    await connection.rollback();

    // Logs the complete backend error for debugging.
    console.error("Update Locking Rules Error:", error);

    // Returns the update error to the client.
    return res.status(500).json({
      success: false,
      message: "Failed to update locking rules",
      error: error.message,
    });
  } finally {
    // Releases the database connection back to the connection pool.
    connection.release();
  }
};
// Exports the Administrator Locking Rules controller functions.
module.exports = {
    getLockingRules,
    updateLockingRules
};