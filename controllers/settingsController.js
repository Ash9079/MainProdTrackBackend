const db = require("../config/db");

const getSettings = async (req, res) => {
  try {
    const [
      [settingRows],
      [notificationRows],
    ] = await Promise.all([
      db.query(`
        SELECT
          setting_key,
          setting_value,
          description,
          modified_by,
          modified_at

        FROM app_setting

        ORDER BY setting_key ASC
      `),

      db.query(`
        SELECT
          type_id,
          code,
          name,
          channel,
          is_enabled

        FROM notification_type

        ORDER BY type_id ASC
      `),
    ]);

    const settings = {};

    settingRows.forEach((setting) => {
      settings[setting.setting_key] =
        setting.setting_value;
    });

    const notifications =
      notificationRows.map(
        (notification) => ({
          typeId: notification.type_id,
          code: notification.code,
          name: notification.name,
          channel: notification.channel,
          isEnabled:
            Number(
              notification.is_enabled
            ) === 1,
        })
      );

    return res.status(200).json({
      success: true,
      settings,
      notifications,
    });
  } catch (error) {
    console.error(
      "Get Settings Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load settings",
      error: error.message,
    });
  }
};

const updateSettings = async (req, res) => {
  let connection;

  try {
    const administratorId = req.user.id;

    const settings =
      req.body?.settings || {};

    const notifications =
      req.body?.notifications || [];

    const allowedSettings = {
      auth_method: [
        "sso",
        "password",
        "both",
      ],

      password_reset: [
        "self_service",
        "administrator",
      ],

      session_timeout_minutes: [
        "15",
        "30",
        "60",
      ],

      productivity_base_metric: [
        "documents_completed",
        "batches_processed",
      ],

      productivity_exclude_approved_leave: [
        "0",
        "1",
      ],
    };

    const settingUpdates =
      Object.entries(settings);

    if (
      settingUpdates.length === 0 &&
      notifications.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "No settings were provided",
      });
    }

    for (const [key, rawValue] of settingUpdates) {
      const value = String(rawValue).trim();

      if (key === "productivity_formula") {
        if (
          !value ||
          value.length > 300
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Productivity formula must contain between 1 and 300 characters",
          });
        }

        continue;
      }

      if (
        !allowedSettings[key] ||
        !allowedSettings[key].includes(value)
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Invalid value for setting '${key}'`,
        });
      }
    }

    for (const notification of notifications) {
      if (
        typeof notification.code !== "string" ||
        !notification.code.trim() ||
        typeof notification.isEnabled !==
          "boolean"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid notification setting",
        });
      }
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    for (const [key, rawValue] of settingUpdates) {
      await connection.query(
        `
        UPDATE app_setting
        SET
          setting_value = ?,
          modified_by = ?,
          modified_at = NOW()
        WHERE setting_key = ?
        `,
        [
          String(rawValue).trim(),
          administratorId,
          key,
        ]
      );
    }

    for (const notification of notifications) {
      await connection.query(
        `
        UPDATE notification_type
        SET is_enabled = ?
        WHERE code = ?
        `,
        [
          notification.isEnabled ? 1 : 0,
          notification.code.trim(),
        ]
      );
    }

    const changedItems = [
      ...settingUpdates.map(
        ([key]) => key
      ),

      ...notifications.map(
        (notification) =>
          notification.code
      ),
    ];

    await connection.query(
      `
      INSERT INTO audit_log
      (
        user_id,
        action,
        entity_type,
        entity_ref,
        detail
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        administratorId,
        "Updated application settings",
        "app_setting",
        "global",
        `Updated: ${changedItems.join(", ")}`
          .slice(0, 500),
      ]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Settings saved successfully",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(
      "Update Settings Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to save settings",
      error: error.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  getSettings,
  updateSettings,
};