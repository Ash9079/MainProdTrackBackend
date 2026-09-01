const db = require("../config/db");

// Gets notifications for the logged-in user
const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const [notifications] = await db.query(
      `
      SELECT
        n.notification_id AS id,
        n.notification_id,

        nt.code AS type,
        nt.name AS type_name,

        n.title,
        n.body AS message,
        n.link_hash,

        n.is_read,
        n.created_at

      FROM notification n

      JOIN notification_type nt
        ON nt.type_id = n.type_id

      WHERE n.user_id = ?

      ORDER BY
        n.created_at DESC,
        n.notification_id DESC
      `,
      [userId]
    );

    const unreadCount = notifications.filter(
      (notification) =>
        Number(notification.is_read) === 0
    ).length;

    return res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error(
      "Get Notifications Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load notifications",
      error: error.message,
    });
  }
};

// Marks one notification as read
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = Number(req.params.id);

    if (
      !Number.isSafeInteger(notificationId) ||
      notificationId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid notification ID is required",
      });
    }

    const [result] = await db.query(
      `
      UPDATE notification
      SET is_read = 1
      WHERE notification_id = ?
        AND user_id = ?
      `,
      [notificationId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notificationId,
    });
  } catch (error) {
    console.error(
      "Mark Notification Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update notification",
      error: error.message,
    });
  }
};

// Marks all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const [result] = await db.query(
      `
      UPDATE notification
      SET is_read = 1
      WHERE user_id = ?
        AND is_read = 0
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      updatedCount: result.affectedRows,
    });
  } catch (error) {
    console.error(
      "Mark All Notifications Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update notifications",
      error: error.message,
    });
  }
};

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
};