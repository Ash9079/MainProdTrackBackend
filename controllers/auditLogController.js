const db = require("../config/db");

const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const pageSize = Math.min(
      Math.max(
        Number(req.query.pageSize) || 50,
        1
      ),
      100
    );

    const offset =
      (page - 1) * pageSize;

    const search = String(
      req.query.search || ""
    ).trim();

    let searchCondition = "";
    const searchValues = [];

    if (search) {
      const searchText = `%${search}%`;

      searchCondition = `
        WHERE
          u.full_name LIKE ?
          OR al.action LIKE ?
          OR al.entity_type LIKE ?
          OR al.entity_ref LIKE ?
          OR al.detail LIKE ?
      `;

      searchValues.push(
        searchText,
        searchText,
        searchText,
        searchText,
        searchText
      );
    }

    const [[logs], [countRows]] =
      await Promise.all([
        db.query(
          `
          SELECT
            al.user_id,
            al.action,
            al.entity_type,
            al.entity_ref,
            al.detail,
            al.created_at,

            COALESCE(
              u.full_name,
              'System'
            ) AS user_name,

            u.emp_code

          FROM audit_log al

          LEFT JOIN users u
            ON u.user_id = al.user_id

          ${searchCondition}

          ORDER BY al.created_at DESC

          LIMIT ?
          OFFSET ?
          `,
          [
            ...searchValues,
            pageSize,
            offset,
          ]
        ),

        db.query(
          `
          SELECT
            COUNT(*) AS total

          FROM audit_log al

          LEFT JOIN users u
            ON u.user_id = al.user_id

          ${searchCondition}
          `,
          searchValues
        ),
      ]);

    const total = Number(
      countRows[0]?.total || 0
    );

    return res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(
        total / pageSize
      ),
      logs,
    });
  } catch (error) {
    console.error(
      "Get Audit Logs Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load audit logs",
      error: error.message,
    });
  }
};

module.exports = {
  getAuditLogs,
};