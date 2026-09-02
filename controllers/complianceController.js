const db = require("../config/db");

const getComplianceOverview = async (req, res) => {
  try {
    const [
      [summaryRows],
      [projectRows],
      [guideRows],
      [pendingRows],
    ] = await Promise.all([
      // Overall summary
      db.query(`
        SELECT
          COUNT(*) AS totalRequired,

          COUNT(
            CASE
              WHEN ga.status = 'read' THEN 1
            END
          ) AS acknowledged,

          COUNT(
            CASE
              WHEN ga.status IS NULL
                OR ga.status <> 'read'
              THEN 1
            END
          ) AS pending,

         COUNT(
            DISTINCT required.version_id
            ) AS activeGuides,

            (
            SELECT COUNT(*)
            FROM notification n

            JOIN notification_type nt
                ON nt.type_id = n.type_id

            WHERE nt.code = 'guide_update'
                AND n.title =
                'Guide acknowledgement reminder'
                AND n.created_at >= CURDATE()
                AND n.created_at <
                DATE_ADD(
                    CURDATE(),
                    INTERVAL 1 DAY
                )
            ) AS remindersSent

        FROM (
          SELECT DISTINCT
            pa.user_id,
            gv.version_id

          FROM project_assignment pa

          JOIN users u
            ON u.user_id = pa.user_id
           AND u.status = 'active'

          JOIN role r
            ON r.role_id = u.role_id
           AND r.code = 'indexer'

          JOIN project p
            ON p.project_id = pa.project_id
           AND p.status = 'active'

          JOIN guide g
            ON g.project_id = p.project_id

          JOIN guide_version gv
            ON gv.guide_id = g.guide_id
           AND gv.is_latest = 1
           AND gv.requires_ack = 1
        ) required

        LEFT JOIN guide_acknowledgement ga
          ON ga.user_id = required.user_id
         AND ga.version_id = required.version_id
      `),

      // Project-wise compliance
      db.query(`
        SELECT
          p.project_id,
          p.project_name,

          COUNT(
            DISTINCT CONCAT(
              pa.user_id,
              ':',
              gv.version_id
            )
          ) AS totalRequired,

          COUNT(
            DISTINCT CASE
              WHEN ga.status = 'read'
              THEN CONCAT(
                pa.user_id,
                ':',
                gv.version_id
              )
            END
          ) AS acknowledged

        FROM project p

        JOIN project_assignment pa
          ON pa.project_id = p.project_id

        JOIN users u
          ON u.user_id = pa.user_id
         AND u.status = 'active'

        JOIN role r
          ON r.role_id = u.role_id
         AND r.code = 'indexer'

        JOIN guide g
          ON g.project_id = p.project_id

        JOIN guide_version gv
          ON gv.guide_id = g.guide_id
         AND gv.is_latest = 1
         AND gv.requires_ack = 1

        LEFT JOIN guide_acknowledgement ga
          ON ga.user_id = pa.user_id
         AND ga.version_id = gv.version_id

        WHERE p.status = 'active'

        GROUP BY
          p.project_id,
          p.project_name

        ORDER BY p.project_name ASC
      `),

      // Latest guide version tracking
      db.query(`
        SELECT
          p.project_id,
          p.project_name,
          gv.version_id,
          gv.version_label AS version,

          COUNT(
            DISTINCT pa.user_id
          ) AS totalEmployees,

          COUNT(
            DISTINCT CASE
              WHEN ga.status = 'read'
              THEN pa.user_id
            END
          ) AS acknowledged

        FROM project p

        JOIN project_assignment pa
          ON pa.project_id = p.project_id

        JOIN users u
          ON u.user_id = pa.user_id
         AND u.status = 'active'

        JOIN role r
          ON r.role_id = u.role_id
         AND r.code = 'indexer'

        JOIN guide g
          ON g.project_id = p.project_id

        JOIN guide_version gv
          ON gv.guide_id = g.guide_id
         AND gv.is_latest = 1
         AND gv.requires_ack = 1

        LEFT JOIN guide_acknowledgement ga
          ON ga.user_id = pa.user_id
         AND ga.version_id = gv.version_id

        WHERE p.status = 'active'

        GROUP BY
          p.project_id,
          p.project_name,
          gv.version_id,
          gv.version_label

        ORDER BY p.project_name ASC
      `),

      // Employees with pending acknowledgements
      db.query(`
        SELECT DISTINCT
          u.user_id,
          u.emp_code,
          u.full_name AS employeeName,

          p.project_id,
          p.project_name,

          gv.version_id,
          gv.version_label AS version,

          'PENDING' AS status

        FROM project_assignment pa

        JOIN users u
          ON u.user_id = pa.user_id
         AND u.status = 'active'

        JOIN role r
          ON r.role_id = u.role_id
         AND r.code = 'indexer'

        JOIN project p
          ON p.project_id = pa.project_id
         AND p.status = 'active'

        JOIN guide g
          ON g.project_id = p.project_id

        JOIN guide_version gv
          ON gv.guide_id = g.guide_id
         AND gv.is_latest = 1
         AND gv.requires_ack = 1

        LEFT JOIN guide_acknowledgement ga
          ON ga.user_id = u.user_id
         AND ga.version_id = gv.version_id

        WHERE ga.ack_id IS NULL
           OR ga.status <> 'read'

        ORDER BY
          u.full_name ASC,
          p.project_name ASC
      `),
    ]);

    const summary = summaryRows[0] || {};

    const totalRequired = Number(
      summary.totalRequired || 0
    );

    const acknowledged = Number(
      summary.acknowledged || 0
    );

    const overallCompliance =
      totalRequired > 0
        ? Math.round(
            (acknowledged / totalRequired) * 100
          )
        : 0;

    const projectCompliance = projectRows.map(
      (project) => {
        const required = Number(
          project.totalRequired || 0
        );

        const read = Number(
          project.acknowledged || 0
        );

        return {
          projectId: project.project_id,
          projectName: project.project_name,
          totalRequired: required,
          acknowledged: read,
          compliance:
            required > 0
              ? Math.round((read / required) * 100)
              : 0,
        };
      }
    );

    const guideTracking = guideRows.map(
      (guide) => ({
        projectId: guide.project_id,
        projectName: guide.project_name,
        versionId: guide.version_id,
        version: guide.version,
        totalEmployees: Number(
          guide.totalEmployees || 0
        ),
        acknowledged: Number(
          guide.acknowledged || 0
        ),
      })
    );

    return res.status(200).json({
      success: true,

      summary: {
        overallCompliance,
        pendingAcknowledgements: Number(
          summary.pending || 0
        ),
        activeGuides: Number(
          summary.activeGuides || 0
        ),
        remindersSent: Number(
        summary.remindersSent || 0
        ),
      },

      projectCompliance,
      guideTracking,
      pendingAcknowledgements: pendingRows,
    });
  } catch (error) {
    console.error(
      "Compliance Overview Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load compliance information",
      error: error.message,
    });
  }
};

const sendComplianceReminders = async (
  req,
  res
) => {
  try {
    const [result] = await db.query(
      `
      INSERT INTO notification
      (
        user_id,
        type_id,
        title,
        body,
        link_hash,
        is_read,
        created_at
      )

      SELECT DISTINCT
        u.user_id,
        nt.type_id,

        'Guide acknowledgement reminder',

        CONCAT(
          'Please acknowledge guide ',
          gv.version_label,
          ' for ',
          p.project_name,
          '.'
        ),

        CONCAT(
          '#/indexing-guide?versionId=',
          gv.version_id
        ),

        0,
        NOW()

      FROM project_assignment pa

      JOIN users u
        ON u.user_id = pa.user_id
       AND u.status = 'active'

      JOIN role r
        ON r.role_id = u.role_id
       AND r.code = 'indexer'

      JOIN project p
        ON p.project_id = pa.project_id
       AND p.status = 'active'

      JOIN guide g
        ON g.project_id = p.project_id

      JOIN guide_version gv
        ON gv.guide_id = g.guide_id
       AND gv.is_latest = 1
       AND gv.requires_ack = 1

      JOIN notification_type nt
        ON nt.code = 'guide_update'
       AND nt.is_enabled = 1

      LEFT JOIN guide_acknowledgement ga
        ON ga.user_id = u.user_id
       AND ga.version_id = gv.version_id

      WHERE (
        ga.ack_id IS NULL
        OR ga.status <> 'read'
      )

      AND NOT EXISTS (
        SELECT 1
        FROM notification existing_notification

        WHERE
          existing_notification.user_id =
            u.user_id

          AND existing_notification.type_id =
            nt.type_id

          AND existing_notification.title =
            'Guide acknowledgement reminder'

          AND existing_notification.link_hash =
            CONCAT(
              '#/indexing-guide?versionId=',
              gv.version_id
            )

          AND existing_notification.created_at >=
            CURDATE()

          AND existing_notification.created_at <
            DATE_ADD(
              CURDATE(),
              INTERVAL 1 DAY
            )
      )
      `
    );

    return res.status(200).json({
      success: true,
      message:
        result.affectedRows > 0
          ? `${result.affectedRows} reminder(s) sent successfully`
          : "No new reminders were required",
      remindersSent: result.affectedRows,
    });
  } catch (error) {
    console.error(
      "Send Compliance Reminders Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to send compliance reminders",
      error: error.message,
    });
  }
};

module.exports = {
  getComplianceOverview,
  sendComplianceReminders,
};