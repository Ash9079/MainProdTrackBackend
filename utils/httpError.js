const db = require("../config/db");
const { writeLog } = require("./fileLogger");

const DB_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_HOST_NOT_PRIVILEGED",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_NO_SUCH_TABLE",
  "ER_BAD_FIELD_ERROR",
  "ER_PARSE_ERROR",
  "ER_DUP_ENTRY",
  "ER_TRUNCATED_WRONG_VALUE",
  "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD",
  "ER_WRONG_VALUE_COUNT_ON_ROW",
  "ER_NO_REFERENCED_ROW_2",
  "ER_ROW_IS_REFERENCED_2",
  "ER_DATA_TOO_LONG",
  "ER_LOCK_WAIT_TIMEOUT",
  "ER_LOCK_DEADLOCK",
]);

const isDbError = (error) => {
  const code = String(error?.code || "");
  return DB_CODES.has(code) || code.startsWith("ER_") || code.startsWith("PROTOCOL_");
};

const sendError = (
  res,
  error,
  {
    context = "Request failed",
    message = "Something went wrong",
    status = 500,
    extra = {},
  } = {}
) => {
  const dbDetails =
    isDbError(error) && typeof db.formatError === "function"
      ? db.formatError(error)
      : null;

  if (dbDetails && typeof db.logError === "function") {
    db.logError(context, error);
  } else {
    writeLog("app-error.log", "ERROR", `[API] ${context}: ${error?.message || "Unknown error"}`, {
      name: error?.name,
      code: error?.code,
      status,
    });
  }

  if (res.headersSent) {
    return;
  }

  const payload = {
    success: false,
    message,
    ...extra,
  };

  // Always return a safe error payload so CWP/live login failures are visible in the UI.
  payload.error = dbDetails
    ? {
        code: dbDetails.code,
        message: dbDetails.message,
        hint: dbDetails.hint,
      }
    : {
        name: error?.name,
        code: error?.code,
        message: error?.message,
      };

  return res.status(status).json(payload);
};

module.exports = {
  isDbError,
  sendError,
};
