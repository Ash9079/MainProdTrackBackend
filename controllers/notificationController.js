const db = require("../config/db");

// Gets notifications for the logged-in user
const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const [notifications] = await db.query(
      `
      SELECT
        id,
        type,
        title,
        message,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("Get Notifications Error:", error);

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
    const notificationId = req.params.id;

    const [result] = await db.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE id = ?
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
    });
  } catch (error) {
    console.error("Mark Notification Error:", error);

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

    await db.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ?
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark All Notifications Error:", error);

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