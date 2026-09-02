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

const getLoginEvents = async (req, res) => {
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

    const [[events], [countRows]] =
      await Promise.all([
        db.query(
          `
          SELECT
            le.login_id,
            le.user_id,
            le.username_tried,

            COALESCE(
              u.full_name,
              le.username_tried,
              'Unknown user'
            ) AS user_name,

            u.emp_code,

            le.success,
            le.method,

            INET6_NTOA(
              le.ip_address
            ) AS ip_address,

            le.user_agent,
            le.created_at

          FROM login_event le

          LEFT JOIN users u
            ON u.user_id = le.user_id

          ORDER BY
            le.created_at DESC,
            le.login_id DESC

          LIMIT ?
          OFFSET ?
          `,
          [
            pageSize,
            offset,
          ]
        ),

        db.query(`
          SELECT COUNT(*) AS total
          FROM login_event
        `),
      ]);

    const total = Number(
      countRows[0]?.total || 0
    );

    return res.status(200).json({
      success: true,
      count: events.length,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(
        total / pageSize
      ),
      events,
    });
  } catch (error) {
    console.error(
      "Get Login Events Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load login events",
      error: error.message,
    });
  }
};

module.exports = {
  getAuditLogs,
  getLoginEvents,
};