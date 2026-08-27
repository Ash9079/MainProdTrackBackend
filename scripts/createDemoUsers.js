const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

dotenv.config();

const db = require("../config/db");

async function createUsers() {
  try {
    const hashedPassword = await bcrypt.hash(
      "Password@123",
      10
    );

    const users = [
      [
        "EMP-1042",
        "Priya Sharma",
        "priyaindexer@company.com",
        hashedPassword,
        "indexer",
        "Indexing Ops",
      ],

      [
        "EMP-1002",
        "Rohan Mehta",
        "rohanlead@company.com",
        hashedPassword,
        "teamLead",
        "Indexing Ops",
      ],

      [
        "EMP-1003",
        "Meera Nair",
        "meeracore@company.com",
        hashedPassword,
        "coreTeam",
        "Operations",
      ],

      [
        "EMP-1004",
        "System Admin",
        "admin@company.com",
        hashedPassword,
        "administrator",
        "Administration",
      ],
    ];

    for (const user of users) {
      await db.query(
        `
        INSERT INTO users
        (
          employee_id,
          name,
          email,
          password,
          role,
          department
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        user
      );
    }

    console.log("Demo users created successfully");

    process.exit(0);
  } catch (error) {
    console.error("Error creating demo users:");
    console.error(error.message);

    process.exit(1);
  }
}

createUsers();