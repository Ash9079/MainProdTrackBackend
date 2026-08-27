const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");

const login = async (req, res) => {
  try {
    // Get email and password from frontend/Postman
    const { email, password } = req.body;

    // Check required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user by email
    const [users] = await db.query(
      `
      SELECT *
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    // User not found
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = users[0];

    // Check account status
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    // Compare entered password with hashed password
    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Create JWT
    const token = jwt.sign(
      {
        id: user.id,
        employeeId: user.employee_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h",
      }
    );

    // Send response
    return res.status(200).json({
      success: true,
      message: "Login successful",

      token,

      user: {
        id: user.id,
        employeeId: user.employee_id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleKey: user.role,
        department: user.department,
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