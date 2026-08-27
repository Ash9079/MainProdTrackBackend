const db = require("../config/db");
const bcrypt = require("bcryptjs");

// ======================================================
// CHANGE PASSWORD
// Works for logged-in Indexer and Team Lead
// ======================================================

const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    // Check required fields
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Current password, new password and confirm password are required",
      });
    }

    // New password and confirm password must match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }

    // Minimum password length
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    // Get current user password
    const [users] = await db.query(
      `
      SELECT
        id,
        password
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify current password
    const passwordMatches = await bcrypt.compare(
      currentPassword,
      users[0].password
    );

    if (!passwordMatches) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Don't allow same password
    const samePassword = await bcrypt.compare(
      newPassword,
      users[0].password
    );

    if (samePassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from current password",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(
      newPassword,
      10
    );

    // Update password
    await db.query(
      `
      UPDATE users
      SET password = ?
      WHERE id = ?
      `,
      [hashedPassword, userId]
    );

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });

  } catch (error) {
    console.error("Change Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
};

module.exports = {
  changePassword,
};