/**
 * seedAttendanceStatus.js
 *
 * Seeds the attendance_status table with the required rows.
 * Run once: node scripts/seedAttendanceStatus.js
 *
 * Rows:
 *  1 - present        (counts as production day, not leave)
 *  2 - planned_leave  (does not count as production day, is_leave = 1)
 *  3 - sick_leave     (does not count as production day, is_leave = 1)
 *  4 - training       (counts as production day, not leave)
 */

require("dotenv").config();
const db = require("../config/db");

const rows = [
  {
    status_id: 1,
    code: "present",
    name: "Present",
    counts_as_production_day: 1,
    is_leave: 0,
  },
  {
    status_id: 2,
    code: "planned_leave",
    name: "Planned Leave",
    counts_as_production_day: 0,
    is_leave: 1,
  },
  {
    status_id: 3,
    code: "sick_leave",
    name: "Sick Leave",
    counts_as_production_day: 0,
    is_leave: 1,
  },
  {
    status_id: 4,
    code: "training",
    name: "Training",
    counts_as_production_day: 1,
    is_leave: 0,
  },
];

async function seed() {
  let connection;
  try {
    connection = await db.getConnection();

    for (const row of rows) {
      await connection.query(
        `
        INSERT INTO attendance_status
          (status_id, code, name, counts_as_production_day, is_leave)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name                    = VALUES(name),
          counts_as_production_day = VALUES(counts_as_production_day),
          is_leave                = VALUES(is_leave)
        `,
        [
          row.status_id,
          row.code,
          row.name,
          row.counts_as_production_day,
          row.is_leave,
        ]
      );
      console.log(`  ✓ ${row.code} (id=${row.status_id})`);
    }

    console.log("\nattendance_status seeded successfully.");
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

seed();
