const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      console.error(
        "[AUTH] JWT_SECRET is missing. Uncomment/set JWT_SECRET in .env and restart."
      );
      return res.status(500).json({
        success: false,
        message: "Server auth is misconfigured",
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    console.error("[AUTH] Token verification failed:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = authenticate;