/**
 * resetPasswords.js
 * Run: node scripts/resetPasswords.js
 * Sets password_hash = bcrypt("demo123") for ALL active users.
 */

const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
dotenv.config();

const db = require("../config/db");

async function resetPasswords() {
  try {
    const hash = await bcrypt.hash("demo123", 12);
    console.log("Generated hash:", hash);

    const [result] = await db.query(
      `UPDATE users SET password_hash = ? WHERE status = 'active'`,
      [hash]
    );

    console.log(`Updated ${result.affectedRows} users.`);
    console.log("Done! All active users now have password: demo123");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

resetPasswords();
