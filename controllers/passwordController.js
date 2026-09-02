const db = require("../config/db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// ======================================================
// REQUEST PASSWORD RESET
// Inserts a row in password_reset table
// POST /api/password/request-reset
// ======================================================
const requestPasswordReset = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check user exists and is active
    const [users] = await db.query(
      `SELECT user_id, email, full_name
       FROM users
       WHERE user_id = ? AND status = 'active'
       LIMIT 1`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Active user not found",
      });
    }

    // Generate a secure random token
    const rawToken  = crypto.randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(rawToken, 10);

    // Insert row into password_reset table — expiry set by MySQL (no timezone issue)
    await db.query(
      `INSERT INTO password_reset
         (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [userId, tokenHash]
    );

    // Read back the expiry so we can return it
    const [[row]] = await db.query(
      `SELECT expires_at FROM password_reset
       WHERE user_id = ? AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "Password reset link generated successfully",
      resetToken: rawToken,
      expiresAt: row.expires_at,
    });
  } catch (error) {
    console.error("Request Password Reset Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate reset link",
      error: error.message,
    });
  }
};

// ======================================================
// CHANGE PASSWORD WITH RESET TOKEN
// Verifies token from password_reset table, updates hash,
// marks token as used.
// POST /api/password/reset-with-token
// ======================================================
const changePasswordWithToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Reset token, new password and confirm password are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    // Get latest unused, non-expired token for this user
    const [tokens] = await db.query(
      `SELECT reset_id, token_hash
       FROM password_reset
       WHERE user_id = ?
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Reset token is invalid or has expired. Please request a new one.",
      });
    }

    // Try each recent token (in case of multiple requests)
    let validTokenRow = null;
    for (const row of tokens) {
      const match = await bcrypt.compare(resetToken, row.token_hash);
      if (match) { validTokenRow = row; break; }
    }

    if (!validTokenRow) {
      return res.status(400).json({
        success: false,
        message: "Reset token is invalid. Please request a new one.",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await db.query(
      `UPDATE users SET password_hash = ? WHERE user_id = ?`,
      [hashedPassword, userId]
    );

    // Mark token as used
    await db.query(
      `UPDATE password_reset SET used_at = NOW() WHERE reset_id = ?`,
      [validTokenRow.reset_id]
    );

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset Password With Token Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password",
      error: error.message,
    });
  }
};

// ======================================================
// CHANGE PASSWORD (direct — logged-in user knows current)
// PATCH /api/password/change-password
// ======================================================
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password, new password and confirm password are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    if (Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "New password cannot exceed 72 bytes",
      });
    }

    const [users] = await db.query(
      `SELECT user_id, password_hash FROM users
       WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "Active user not found" });
    }

    const user = users[0];

    if (!user.password_hash) {
      return res.status(400).json({
        success: false,
        message: "Password change is unavailable for this account",
      });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatches) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    const samePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (samePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await db.query(
      `UPDATE users SET password_hash = ? WHERE user_id = ?`,
      [hashedPassword, userId]
    );

    return res.status(200).json({ success: true, message: "Password changed successfully" });
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
  requestPasswordReset,
  changePasswordWithToken,
  changePassword,
};