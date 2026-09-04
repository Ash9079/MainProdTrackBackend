const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const crypto = require("crypto");

const {
  sendPasswordEmail,
} = require("../utils/mailer");

const {
  getAppSetting,
} = require("../utils/appSettings");

const roleKeyMap = {
  indexer: "indexer",
  lead: "teamLead",
  core: "coreTeam",
  admin: "administrator",
};

const recordLoginEvent = async ({
  req,
  userId = null,
  usernameTried = "",
  success = false,
}) => {
  try {
    const ipAddress =
      req.ip ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = String(
      req.headers["user-agent"] || ""
    ).slice(0, 255);

    await db.query(
      `
      INSERT INTO login_event
      (
        user_id,
        username_tried,
        success,
        method,
        ip_address,
        user_agent,
        created_at
      )
      VALUES (
        ?,
        ?,
        ?,
        'password',
        INET6_ATON(?),
        ?,
        NOW()
      )
      `,
      [
        userId,
        String(usernameTried || "")
          .slice(0, 60),
        success ? 1 : 0,
        ipAddress,
        userAgent || null,
      ]
    );
  } catch (error) {
    // Login should continue even if event logging fails.
    console.error(
      "Login Event Error:",
      error
    );
  }
};

const getSessionTimeoutMinutes =
  async () => {
    const [rows] = await db.query(
      `
      SELECT setting_value
      FROM app_setting
      WHERE setting_key =
        'session_timeout_minutes'
      LIMIT 1
      `
    );

    const timeoutMinutes = Number(
      rows[0]?.setting_value
    );

    const allowedTimeouts = [
      15,
      30,
      60,
    ];

    return allowedTimeouts.includes(
      timeoutMinutes
    )
      ? timeoutMinutes
      : 30;
  };

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

      const [users] = await db.query(
        `
        SELECT
          u.user_id,
          u.emp_code,
          u.full_name,
          u.username,
          u.email,
          u.password_hash,
          u.designation,
          u.status,
          d.name AS department,
          r.code AS role_code,
          r.name AS role_name,
          u.auth_method
        FROM users u
        JOIN role r
          ON r.role_id = u.role_id
        LEFT JOIN department d
          ON d.department_id = u.department_id
        WHERE u.email = ? OR u.username = ?
        LIMIT 1
        `,
        [email, email]
      );

    

    if (users.length === 0) {
      await recordLoginEvent({
        req,
        usernameTried: email,
        success: false,
      });

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = users[0];

    if (user.status !== "active") {
      await recordLoginEvent({
        req,
        userId: user.user_id,
        usernameTried: email,
        success: false,
      });
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    const globalAuthMethod =
  await getAppSetting(
    "auth_method",
    "both"
  );

const userAuthMethod =
  user.auth_method || "both";

const passwordLoginAllowed =
  ["password", "both"].includes(
    globalAuthMethod
  ) &&
  ["password", "both"].includes(
    userAuthMethod
  );

if (!passwordLoginAllowed) {
  await recordLoginEvent({
    req,
    userId: user.user_id,
    usernameTried: email,
    success: false,
  });

  return res.status(403).json({
    success: false,
    message:
      "Password login is disabled. Please use Microsoft SSO.",
  });
}

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      await recordLoginEvent({
        req,
        userId: user.user_id,
        usernameTried: email,
        success: false,
      });

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const roleKey = roleKeyMap[user.role_code];

    if (!roleKey) {
      await recordLoginEvent({
        req,
        userId: user.user_id,
        usernameTried: email,
        success: false,
      });
      return res.status(403).json({
        success: false,
        message: "Invalid user role",
      });
    }

    const sessionTimeoutMinutes =
    await getSessionTimeoutMinutes();

    const token = jwt.sign(
      
      {
        id: user.user_id,
        employeeId: user.emp_code,
        role: roleKey,
      },
      process.env.JWT_SECRET,
      {
        expiresIn:
          process.env.JWT_EXPIRES_IN || "8h",
      }
    );

    await db.query(
      `
      UPDATE users
      SET last_login_at = NOW()
      WHERE user_id = ?
      `,
      [user.user_id]
    );

    await recordLoginEvent({
      req,
      userId: user.user_id,
      usernameTried: email,
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      sessionTimeoutMinutes,
      token,
      user: {
        id: user.user_id,
        emp: user.emp_code,
        employeeId: user.emp_code,
        name: user.full_name,
        username: user.username,
        email: user.email,
        department: user.department,
        dept: user.department,
        designation: user.designation,
        role: user.role_name,
        roleKey,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error during login",
      error: error.message,
    });
  }

};

const forgotPassword = async (req, res) => {
  let connection;

  try {
    const identifier = String(
      req.body?.email || ""
    ).trim();

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message:
          "Email or username is required",
      });
    }

    // Check whether self-service reset is enabled
    const passwordResetMethod =
      await getAppSetting(
        "password_reset",
        "self_service"
      );

    if (
      passwordResetMethod !==
      "self_service"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Self-service password reset is disabled. Contact the administrator.",
      });
    }

    // Find user using email or username
    const [users] = await db.query(
      `
      SELECT
        user_id,
        full_name,
        username,
        email,
        status
      FROM users
      WHERE email = ?
         OR username = ?
      LIMIT 1
      `,
      [identifier, identifier]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No user was found with this email or username",
      });
    }

    const user = users[0];

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message:
          "This account is inactive",
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message:
          "No email is registered for this user",
      });
    }

    // Generate actual new password
    const newPassword =
      `Prod@${crypto
        .randomBytes(6)
        .toString("base64url")}`;

    // Store only its hash in database
    const passwordHash =
      await bcrypt.hash(
        newPassword,
        10
      );

    connection =
      await db.getConnection();

    await connection.beginTransaction();

    await connection.query(
      `
      UPDATE users
      SET password_hash = ?
      WHERE user_id = ?
      `,
      [
        passwordHash,
        user.user_id,
      ]
    );

    // Send actual generated password by email
    await sendPasswordEmail({
      name: user.full_name,
      email: user.email,
      password: newPassword,
      subject:
        "Your new ProdTrack password",
    });

    await connection.commit();

    return res.status(200).json({
      success: true,
      message:
        "A new password has been sent to your registered email.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(
      "Forgot Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to reset password",
      error: error.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  login,
  forgotPassword,
};