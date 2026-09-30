// SQL fragments for role.code values that differ across dumps
// (lead vs TEAM_LEAD, core vs CORE_TEAM, admin vs ADMIN, indexer vs INDEXER).

const ROLE_CODE_SQL = `LOWER(REPLACE(REPLACE(TRIM(r.code), '-', '_'), ' ', ''))`;

const INDEXER_ROLE_SQL = `(${ROLE_CODE_SQL} IN ('indexer'))`;

const TEAM_LEAD_ROLE_SQL = `(
  ${ROLE_CODE_SQL} IN (
    'lead',
    'team_lead',
    'teamlead'
  )
)`;

const CORE_TEAM_ROLE_SQL = `(${ROLE_CODE_SQL} IN ('core', 'core_team', 'coreteam'))`;

const ADMIN_ROLE_SQL = `(${ROLE_CODE_SQL} IN ('admin', 'administrator'))`;

const SEES_ALL_PROJECTS_SQL = `(
  r.sees_all_projects = 1
  OR ${CORE_TEAM_ROLE_SQL}
  OR ${ADMIN_ROLE_SQL}
)`;

const normalizeRoleCode = (code) => {
  const key = String(code || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]/g, "_");

  if (key === "indexer") return "indexer";
  if (["lead", "team_lead", "teamlead"].includes(key)) return "lead";
  if (["core", "core_team", "coreteam"].includes(key)) return "core";
  if (["admin", "administrator"].includes(key)) return "admin";
  return key;
};

module.exports = {
  ROLE_CODE_SQL,
  INDEXER_ROLE_SQL,
  TEAM_LEAD_ROLE_SQL,
  CORE_TEAM_ROLE_SQL,
  ADMIN_ROLE_SQL,
  SEES_ALL_PROJECTS_SQL,
  normalizeRoleCode,
};
