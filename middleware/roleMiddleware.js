// Maps legacy/raw DB role codes to the canonical role keys used in allowRoles().
// This handles old tokens that were signed before the roleKeyMap was applied,
// or databases where role.code is stored differently.
const ROLE_ALIASES = {
  lead: "teamLead",
  team_lead: "teamLead",
  teamlead: "teamLead",
  core: "coreTeam",
  core_team: "coreTeam",
  coreteam: "coreTeam",
  admin: "administrator",
  administrator: "administrator",
  indexer: "indexer",
};

const normalizeRole = (role) => {
  if (!role) return null;
  const key = String(role).trim().toLowerCase();
  // If it's already a canonical key, return as-is (case-insensitive match)
  if (ROLE_ALIASES[key]) return ROLE_ALIASES[key];
  // Try matching the original casing too
  if (ROLE_ALIASES[String(role).trim()])
    return ROLE_ALIASES[String(role).trim()];
  return role;
};

const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userRole = normalizeRole(req.user.role);

    // Attach the normalized role so controllers always see the canonical value
    req.user.role = userRole;

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this resource",
      });
    }

    next();
  };
};

module.exports = allowRoles;
