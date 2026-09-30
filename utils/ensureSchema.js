const { writeLog } = require("./fileLogger");
const { SEES_ALL_PROJECTS_SQL } = require("./roleSql");

const ensureProjectVisibility = async (db) => {
  await db.query(`
    UPDATE role
    SET sees_all_projects = 1
    WHERE LOWER(REPLACE(REPLACE(code, '-', '_'), ' ', '')) IN (
      'admin',
      'administrator',
      'core',
      'core_team',
      'coreteam'
    )
  `);

  // phpMyAdmin dumps shipped a stub view: SELECT 1 AS user_id, 1 AS project_id.
  // That hid every real project outside Project Master.
  await db.query(`
    CREATE OR REPLACE VIEW v_user_visible_project AS
    SELECT u.user_id, p.project_id
    FROM users u
    INNER JOIN role r
      ON r.role_id = u.role_id
    INNER JOIN project p
      ON ${SEES_ALL_PROJECTS_SQL}

    UNION

    SELECT pa.user_id, pa.project_id
    FROM project_assignment pa

    UNION

   -- Gives Team Leads visibility to projects assigned to their team members.
SELECT team_lead.user_id, pa.project_id
FROM users team_lead
INNER JOIN users teammate
  ON teammate.team_lead_id = team_lead.user_id
INNER JOIN project_assignment pa
  ON pa.user_id = teammate.user_id
  `);

  writeLog(
    "db.log",
    "INFO",
    "[DB] Project visibility view v_user_visible_project is ready",
  );
};

module.exports = {
  ensureProjectVisibility,
};
