const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const roleKeyMap = {
  indexer: "indexer",
  lead: "teamLead",
  core: "coreTeam",
  admin: "administrator",
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
        r.name AS role_name
      FROM users u
      JOIN role r
        ON r.role_id = u.role_id
      LEFT JOIN department d
        ON d.department_id = u.department_id
      WHERE u.email = ?
      LIMIT 1
      `,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = users[0];

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const roleKey = roleKeyMap[user.role_code];

    if (!roleKey) {
      return res.status(403).json({
        success: false,
        message: "Invalid user role",
      });
    }

    const token = jwt.sign(
      {
        id: user.user_id,
        employeeId: user.emp_code,
        role: roleKey,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h",
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

    return res.status(200).json({
      success: true,
      message: "Login successful",
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

module.exports = {
  login,
};