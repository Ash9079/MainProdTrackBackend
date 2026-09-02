const db = require("../../config/db");

// Gets pending correction requests from the Team Lead's team
const getPendingApprovals = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let scopeCondition = "";
    let queryValues = [];

    // Team Lead sees only their team's requests
    if (role === "teamLead") {
      scopeCondition = `
        AND u.team_lead_id = ?
        AND EXISTS (
          SELECT 1
          FROM project_assignment pa
          WHERE pa.project_id = cr.project_id
            AND pa.user_id = ?
        )
      `;

      queryValues = [userId, userId];
    }

    // Core Team and Administrator see all requests
    else if (
      role === "coreTeam" ||
      role === "administrator"
    ) {
      scopeCondition = "";
      queryValues = [];
    }

    else {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to access corrections",
      });
    }

    const [requests] = await db.query(
      `
      SELECT
        cr.request_id AS id,
        cr.request_id,
        cr.entry_id,

        DATE_FORMAT(
          cr.production_date,
          '%Y-%m-%d'
        ) AS production_date,

        cr.field_name,
        cr.old_value,
        cr.new_value,
        cr.reason,

        cs.code AS status,
        cs.name AS status_name,

        cr.approver_comments AS review_comment,
        cr.requested_at AS created_at,

        u.user_id AS employee_id,
        u.emp_code AS employee_code,
        u.full_name AS employee_name,

        p.project_id,
        p.project_name

      FROM correction_request cr

      JOIN correction_status cs
        ON cs.status_id = cr.status_id

      JOIN users u
        ON u.user_id = cr.requested_by

      JOIN project p
        ON p.project_id = cr.project_id

      WHERE cs.code = 'pending'
        ${scopeCondition}

      ORDER BY
        cr.requested_at DESC,
        cr.request_id DESC
      `,
      queryValues
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });

  } catch (error) {
    console.error(
      "Get Pending Approvals Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load correction requests",
      error: error.message,
    });
  }
};


// Approves a correction request and notifies the Indexer
const approveCorrectionRequest = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const reviewerId = req.user.id;
const role = req.user.role;

let requestScope = "";
let scopeValues = [];

if (role === "teamLead") {
  requestScope = `
    AND u.team_lead_id = ?
    AND EXISTS (
      SELECT 1
      FROM project_assignment pa
      WHERE pa.project_id = cr.project_id
        AND pa.user_id = ?
    )
  `;

  scopeValues = [reviewerId, reviewerId];
} else if (
  role === "coreTeam" ||
  role === "administrator"
) {
  requestScope = "";
} else {
  return res.status(403).json({
    success: false,
    message:
      "You are not allowed to approve corrections",
  });
}
    const requestId = Number(req.params.id);
    const reviewComment = String(
      req.body?.reviewComment || ""
    ).trim();

    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid correction request ID is required",
      });
    }

    if (reviewComment.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Review comment cannot exceed 500 characters",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const reject = (httpStatus, message) => {
      throw Object.assign(new Error(message), {
        httpStatus,
      });
    };

    // Lock and verify the request belongs to this Team Lead.
    const [requests] = await connection.query(
      `
      SELECT
        cr.request_id,
        cr.requested_by,
        cr.status_id,
        cr.entry_id,
        cr.field_name,
        cr.new_value,

        de.docs_received,
        de.docs_completed,

        cs.code AS status

      FROM correction_request cr

      JOIN daily_entry de
        ON de.entry_id = cr.entry_id

      JOIN correction_status cs
        ON cs.status_id = cr.status_id

      JOIN users u
        ON u.user_id = cr.requested_by

      WHERE cr.request_id = ?
        ${requestScope}

      FOR UPDATE
      `,
      [requestId, ...scopeValues]
    );

    if (requests.length === 0) {
      reject(404, "Correction request not found");
    }

    if (requests[0].status !== "pending") {
      reject(409, "Correction request has already been reviewed");
    }

    const [statuses] = await connection.query(
      `
      SELECT status_id
      FROM correction_status
      WHERE code = 'approved'
      LIMIT 1
      `
    );

    if (statuses.length === 0) {
      reject(500, "Approved correction status is not configured");
    }

    const [result] = await connection.query(
      `
      UPDATE correction_request
      SET
        status_id = ?,
        approved_by = ?,
        approved_at = NOW(),
        approver_comments = ?
      WHERE request_id = ?
        AND status_id = ?
      `,
      [
        statuses[0].status_id,
        reviewerId,
        reviewComment || null,
        requestId,
        requests[0].status_id,
      ]
    );

    if (result.affectedRows !== 1) {
      reject(409, "Correction request changed. Refresh and try again");
    }

    // Allowed daily-entry fields that can be corrected.
const editableFields = {
  docs_received: "docs_received",
  docs_completed: "docs_completed",
};

const requestedField = String(
  requests[0].field_name || ""
)
  .trim()
  .toLowerCase();

const columnName = editableFields[requestedField];

if (!columnName) {
  reject(
    400,
    `The field '${requestedField}' cannot be corrected`
  );
}

const correctedValue = Number(
  requests[0].new_value
);

if (
  !Number.isSafeInteger(correctedValue) ||
  correctedValue < 0
) {
  reject(
    400,
    "The corrected value must be a non-negative integer"
  );
}

// Completed documents cannot exceed received documents.
if (
  requestedField === "docs_completed" &&
  correctedValue >
    Number(requests[0].docs_received)
) {
  reject(
    400,
    "Completed documents cannot exceed received documents"
  );
}

// Received documents cannot be less than completed documents.
if (
  requestedField === "docs_received" &&
  correctedValue <
    Number(requests[0].docs_completed)
) {
  reject(
    400,
    "Received documents cannot be less than completed documents"
  );
}

const [dailyEntryResult] =
  await connection.query(
    `
    UPDATE daily_entry
    SET ${columnName} = ?
    WHERE entry_id = ?
    `,
    [
      correctedValue,
      requests[0].entry_id,
    ]
  );

if (dailyEntryResult.affectedRows !== 1) {
  reject(
    404,
    "Original daily entry was not found"
  );
}

    await connection.query(
      `
      INSERT INTO notification
      (
        user_id,
        type_id,
        title,
        body,
        link_hash,
        is_read
      )
      VALUES (
        ?,
        (
          SELECT type_id
          FROM notification_type
          WHERE code = 'correction_approved'
          LIMIT 1
        ),
        ?,
        ?,
        '#/correction-requests',
        0
      )
      `,
      [
        requests[0].requested_by,
        "Correction approved",
        `Your correction request #${requestId} was approved.`,
      ]
    );

    await connection.query(
      `
      INSERT INTO audit_log
      (
        user_id,
        action,
        entity_type,
        entity_ref,
        detail
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        reviewerId,
        "Approved correction",
        "correction_request",
        String(requestId),
        reviewComment
          ? `Correction approved. Comment: ${reviewComment}`
          : "Correction approved",
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: "Correction request approved successfully",
      requestId,
      status: "APPROVED",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Approve rollback error:",
          rollbackError
        );
      }
    }

    console.error("Approve Correction Error:", error);

    return res.status(error.httpStatus || 500).json({
      success: false,
      message: error.httpStatus
        ? error.message
        : "Failed to approve correction request",
    });
  } finally {
    if (connection) connection.release();
  }
};


// Rejects a correction request and notifies the Indexer
const rejectCorrectionRequest = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const reviewerId = req.user.id;
    const role = req.user.role;
    const requestId = Number(req.params.id);

    const reviewComment = String(
      req.body?.reviewComment || ""
    ).trim();

    let requestScope = "";
    let scopeValues = [];

    if (role === "teamLead") {
      requestScope = `
        AND u.team_lead_id = ?
        AND EXISTS (
          SELECT 1
          FROM project_assignment pa
          WHERE pa.project_id = cr.project_id
            AND pa.user_id = ?
        )
      `;

      scopeValues = [reviewerId, reviewerId];
    } else if (
      role === "coreTeam" ||
      role === "administrator"
    ) {
      requestScope = "";
    } else {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to reject corrections",
      });
    }

    if (
      !Number.isSafeInteger(requestId) ||
      requestId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid correction request ID is required",
      });
    }

    if (reviewComment.length > 500) {
      return res.status(400).json({
        success: false,
        message:
          "Review comment cannot exceed 500 characters",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const reject = (httpStatus, message) => {
      throw Object.assign(new Error(message), {
        httpStatus,
      });
    };

    const [requests] = await connection.query(
      `
      SELECT
        cr.request_id,
        cr.requested_by,
        cr.status_id,
        cr.entry_id,
        cr.field_name,
        cr.new_value,

        de.docs_received,
        de.docs_completed,

        cs.code AS status

      FROM correction_request cr

      JOIN daily_entry de
        ON de.entry_id = cr.entry_id

      JOIN correction_status cs
        ON cs.status_id = cr.status_id

      JOIN users u
        ON u.user_id = cr.requested_by

      WHERE cr.request_id = ?
        ${requestScope}

      FOR UPDATE
      `,
      [requestId, ...scopeValues]
    );

    if (requests.length === 0) {
      reject(404, "Correction request not found");
    }

    if (requests[0].status !== "pending") {
      reject(
        409,
        "Correction request has already been reviewed"
      );
    }

    const [statuses] = await connection.query(
      `
      SELECT status_id
      FROM correction_status
      WHERE code = 'rejected'
      LIMIT 1
      `
    );

    if (statuses.length === 0) {
      reject(
        500,
        "Rejected correction status is not configured"
      );
    }

    const [result] = await connection.query(
      `
      UPDATE correction_request
      SET
        status_id = ?,
        approved_by = ?,
        approved_at = NOW(),
        approver_comments = ?
      WHERE request_id = ?
        AND status_id = ?
      `,
      [
        statuses[0].status_id,
        reviewerId,
        reviewComment || null,
        requestId,
        requests[0].status_id,
      ]
    );

    if (result.affectedRows !== 1) {
      reject(
        409,
        "Correction request changed. Refresh and try again"
      );
    }

    const [notificationTypes] =
      await connection.query(
        `
        SELECT type_id
        FROM notification_type
        WHERE code = 'correction_rejected'
        LIMIT 1
        `
      );

    if (notificationTypes.length > 0) {
      await connection.query(
        `
        INSERT INTO notification
        (
          user_id,
          type_id,
          title,
          body,
          link_hash,
          is_read
        )
        VALUES (?, ?, ?, ?, ?, 0)
        `,
        [
          requests[0].requested_by,
          notificationTypes[0].type_id,
          "Correction rejected",
          `Your correction request #${requestId} was rejected.`,
          "#correction-requests",
        ]
      );
    }

    await connection.query(
      `
      INSERT INTO audit_log
      (
        user_id,
        action,
        entity_type,
        entity_ref,
        detail
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        reviewerId,
        "Rejected correction",
        "correction_request",
        String(requestId),
        reviewComment
          ? `Correction rejected. Comment: ${reviewComment}`
          : "Correction rejected",
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message:
        "Correction request rejected successfully",
      requestId,
      status: "REJECTED",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error(
      "Reject Correction Error:",
      error
    );

    return res
      .status(error.httpStatus || 500)
      .json({
        success: false,
        message: error.httpStatus
          ? error.message
          : "Failed to reject correction request",
      });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const getApprovalSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let scopeCondition = "";
    let queryValues = [];

    if (role === "teamLead") {
      scopeCondition = `
        AND u.team_lead_id = ?
        AND EXISTS (
          SELECT 1
          FROM project_assignment pa
          WHERE pa.user_id = ?
            AND pa.project_id = cr.project_id
        )
      `;

      queryValues = [userId, userId];
    } else if (
      role === "coreTeam" ||
      role === "administrator"
    ) {
      scopeCondition = "";
    } else {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to access correction summary",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        SUM(
          CASE
            WHEN cs.code = 'pending' THEN 1
            ELSE 0
          END
        ) AS awaiting_review,

        SUM(
          CASE
            WHEN cs.code = 'approved'
              AND cr.approved_at >=
                DATE_FORMAT(CURDATE(), '%Y-%m-01')
            THEN 1
            ELSE 0
          END
        ) AS approved_month,

        SUM(
          CASE
            WHEN cs.code = 'rejected'
              AND cr.approved_at >=
                DATE_FORMAT(CURDATE(), '%Y-%m-01')
            THEN 1
            ELSE 0
          END
        ) AS rejected_month,

        ROUND(
          AVG(
            CASE
              WHEN cs.code IN ('approved', 'rejected')
                AND cr.approved_at IS NOT NULL
              THEN TIMESTAMPDIFF(
                MINUTE,
                cr.requested_at,
                cr.approved_at
              ) / 60
              ELSE NULL
            END
          ),
          1
        ) AS average_turnaround_hours

      FROM correction_request cr

      JOIN correction_status cs
        ON cs.status_id = cr.status_id

      JOIN users u
        ON u.user_id = cr.requested_by

      WHERE 1 = 1
        ${scopeCondition}
      `,
      queryValues
    );

    const summary = rows[0] || {};

    return res.status(200).json({
      success: true,
      summary: {
        awaitingReview: Number(
          summary.awaiting_review || 0
        ),
        approvedMonth: Number(
          summary.approved_month || 0
        ),
        rejectedMonth: Number(
          summary.rejected_month || 0
        ),
        averageTurnaroundHours: Number(
          summary.average_turnaround_hours || 0
        ),
      },
    });
  } catch (error) {
    console.error("Approval Summary Error:", error);

    return res.status(500).json({
      success: false,
      message:
        "Failed to load correction approval summary",
      error: error.message,
    });
  }
};


module.exports = {
  getPendingApprovals,
  getApprovalSummary,
  approveCorrectionRequest,
  rejectCorrectionRequest,
};