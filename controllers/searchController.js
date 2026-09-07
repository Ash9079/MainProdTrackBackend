// Imports the MySQL database connection.
const db = require("../config/db");

// ======================================================
// GLOBAL BASIC SEARCH
// ======================================================

// Searches projects, users, and daily entries using one text query.
const globalSearch = async (req, res) => {
  try {
    // Reads the search text from the query string.
    const searchTerm = String(req.query.q || "").trim();

    // Returns an empty result when the user has not typed anything.
    if (!searchTerm) {
      return res.status(200).json({
        success: true,
        results: [],
      });
    }

    // Adds wildcard matching for MySQL LIKE searches.
    const likeTerm = `%${searchTerm}%`;

    // Searches active and inactive project names/codes.
    const [projects] = await db.query(
      `
      SELECT
        project_id AS id,
        project_code AS code,
        project_name AS title,
        'project' AS type
      FROM project
      WHERE
        project_code LIKE ?
        OR project_name LIKE ?
      LIMIT 5
      `,
      [likeTerm, likeTerm]
    );

    // Searches users by name, employee code, username, or email.
    const [users] = await db.query(
      `
      SELECT
        user_id AS id,
        emp_code AS code,
        full_name AS title,
        'user' AS type
      FROM users
      WHERE
        full_name LIKE ?
        OR emp_code LIKE ?
        OR username LIKE ?
        OR email LIKE ?
      LIMIT 5
      `,
      [likeTerm, likeTerm, likeTerm, likeTerm]
    );

    // Searches production entries by batch/job reference.
    const [entries] = await db.query(
      `
      SELECT
        de.entry_id AS id,
        de.batch_ref AS code,
        CONCAT(
          p.project_name,
          ' - ',
          COALESCE(de.batch_ref, 'Entry')
        ) AS title,
        'entry' AS type
      FROM daily_entry de
      JOIN project p
        ON p.project_id = de.project_id
      WHERE
        de.batch_ref LIKE ?
        OR p.project_name LIKE ?
      LIMIT 5
      `,
      [likeTerm, likeTerm]
    );

    // Combines all three search groups into one result array.
    const results = [
      ...projects,
      ...users,
      ...entries,
    ];

    // Returns search results to the frontend.
    return res.status(200).json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    // Logs unexpected search errors in the backend terminal.
    console.error("Global Search Error:", error);

    // Returns a safe API error response.
    return res.status(500).json({
      success: false,
      message: "Failed to search",
      error: error.message,
    });
  }
};

// Exports the global search controller.
module.exports = {
  globalSearch,
};