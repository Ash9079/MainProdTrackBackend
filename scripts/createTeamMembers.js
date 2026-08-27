const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

dotenv.config();

const db = require("../config/db");

// Creates demo Indexer users for Rohan's team
async function createTeamMembers() {
  try {
    const hashedPassword = await bcrypt.hash("Password@123", 10);

    const users = [
      [
        "EMP-1043",
        "Aditya Rao",
        "aditya@company.com",
        hashedPassword,
        "indexer",
        "Indexing Ops",
      ],
      [
        "EMP-1044",
        "Sneha Iyer",
        "sneha@company.com",
        hashedPassword,
        "indexer",
        "Indexing Ops",
      ],
      [
        "EMP-1045",
        "Karan Patel",
        "karan@company.com",
        hashedPassword,
        "indexer",
        "Indexing Ops",
      ],
      [
        "EMP-1046",
        "Divya Menon",
        "divya@company.com",
        hashedPassword,
        "indexer",
        "Indexing Ops",
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

    console.log("Team members created successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error creating team members:", error.message);
    process.exit(1);
  }
}

createTeamMembers();