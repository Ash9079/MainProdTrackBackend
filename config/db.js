const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");
const { writeLog, logsDir } = require("../utils/fileLogger");

const requiredEnv = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];

const missingEnv = requiredEnv.filter((key) => {
  const value = process.env[key];
  return value === undefined || String(value).trim() === "";
});

if (missingEnv.length > 0) {
  writeLog(
    "db-error.log",
    "FATAL",
    `[DB] Missing required environment variables: ${missingEnv.join(", ")}`
  );
  writeLog(
    "db-error.log",
    "FATAL",
    "[DB] Fix: set them in backend/.env on the CWP server, then restart the Node app."
  );
}

const isLocalDbHost = (host) => {
  const value = String(host || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
};

const resolveDbPort = () => {
  const appPort = Number(process.env.PORT);
  const parsed = Number(process.env.DB_PORT);
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed < 65536;

  if (!valid) {
    return 3306;
  }

  // People often copy the Node listen port into DB_PORT. MySQL is not on 4400.
  if (appPort && parsed === appPort && parsed !== 3306) {
    writeLog(
      "db-error.log",
      "WARN",
      `[DB] DB_PORT=${parsed} is the same as Node PORT. That is the API port, not MySQL. Using 3306 instead.`
    );
    return 3306;
  }

  return parsed;
};

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: resolveDbPort(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 15000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  timezone: process.env.DB_TIMEZONE || "+05:30",
  charset: process.env.DB_CHARSET || "utf8mb4",
  dateStrings: true,
};

if (String(process.env.DB_SSL).toLowerCase() === "true") {
  dbConfig.ssl = {
    rejectUnauthorized:
      String(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() !== "false",
  };
}

const explainDbError = (err) => {
  const code = err?.code || "UNKNOWN";
  const errno = err?.errno;
  const sqlState = err?.sqlState;
  const sqlMessage = err?.sqlMessage || err?.message;
  const sql = err?.sql
    ? String(err.sql).replace(/\s+/g, " ").trim().slice(0, 500)
    : null;

  const hints = {
    ECONNREFUSED:
      "MySQL is not reachable on this host/port. On CWP: start MySQL, set DB_HOST=localhost when Node and MySQL are on the same server, and confirm port 3306.",
    ENOTFOUND:
      "DB_HOST DNS lookup failed. Use a valid hostname/IP. On the same CWP server prefer localhost or 127.0.0.1.",
    EAI_AGAIN:
      "DNS lookup for DB_HOST timed out. Use localhost/127.0.0.1 on CWP, or check nameservers.",
    ETIMEDOUT:
      "Connection timed out. Wrong host, firewall blocking 3306, or remote MySQL is not allowing this server IP.",
    PROTOCOL_CONNECTION_LOST:
      "MySQL closed the connection. Check wait_timeout, max_allowed_packet, and server load in CWP.",
    PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR:
      "The pool is dead after a fatal MySQL error. Restart the Node app after fixing the DB error above.",
    ER_ACCESS_DENIED_ERROR:
      "Wrong DB_USER or DB_PASSWORD, or this user cannot connect from this host. In CWP MySQL check user host (localhost vs %).",
    ER_BAD_DB_ERROR:
      "DB_NAME does not exist. Create the database in CWP phpMyAdmin or fix DB_NAME in .env.",
    ER_HOST_NOT_PRIVILEGED:
      "MySQL user is not allowed to connect from this host. Update the MySQL user Host field.",
    ER_DBACCESS_DENIED_ERROR:
      "User logged in but has no privilege on this database. GRANT ALL on DB_NAME to this user.",
    ER_NO_SUCH_TABLE:
      "A required table is missing. Import the ProdTrack SQL dump into this database.",
    ER_BAD_FIELD_ERROR:
      "A query referenced a column that does not exist. Schema is out of date with the code.",
    ER_PARSE_ERROR:
      "SQL syntax error. See the SQL snippet in db-error.log.",
    ER_DUP_ENTRY:
      "Duplicate value for a UNIQUE/PRIMARY key.",
    ER_LOCK_WAIT_TIMEOUT:
      "Query waited too long for a row lock. Check long-running queries in MySQL.",
    ER_LOCK_DEADLOCK:
      "Deadlock detected. Retry the request; if it repeats, check overlapping updates.",
  };

  return {
    code,
    errno: errno ?? null,
    sqlState: sqlState ?? null,
    sql,
    message: sqlMessage || "Unknown database error",
    hint: hints[code] || "Check MySQL credentials, host, database name, and CWP MySQL / Node logs.",
  };
};

const logDbError = (context, err) => {
  const details = explainDbError(err);
  const lines = [
    `[DB] ${context}`,
    `[DB] Code: ${details.code}`,
    details.errno != null ? `[DB] Errno: ${details.errno}` : null,
    details.sqlState ? `[DB] SQL State: ${details.sqlState}` : null,
    `[DB] Message: ${details.message}`,
    `[DB] Target: host=${dbConfig.host} port=${dbConfig.port} database=${dbConfig.database} user=${dbConfig.user}`,
    details.sql ? `[DB] SQL: ${details.sql}` : null,
    `[DB] Hint: ${details.hint}`,
    `[DB] Log file: ${path.join(logsDir, "db-error.log")}`,
  ].filter(Boolean);

  lines.forEach((line) => {
    writeLog("db-error.log", "ERROR", line);
  });
};

if (missingEnv.length === 0) {
  writeLog(
    "db.log",
    "INFO",
    `[DB] Pool config ready | host=${dbConfig.host} port=${dbConfig.port} database=${dbConfig.database} user=${dbConfig.user} charset=${dbConfig.charset} limit=${dbConfig.connectionLimit}`
  );

  if (!isLocalDbHost(dbConfig.host)) {
    writeLog(
      "db.log",
      "WARN",
      `[DB] DB_HOST=${dbConfig.host} is not localhost. On CWP set DB_HOST=localhost. Public IP from the same server often causes login 500 (access denied / timeout).`
    );
  }
}

const pool = mysql.createPool(dbConfig);

pool.on("connection", (connection) => {
  writeLog(
    "db.log",
    "INFO",
    `[DB] New connection | threadId=${connection.threadId} | host=${dbConfig.host} | database=${dbConfig.database}`
  );
});

pool.on("enqueue", () => {
  writeLog(
    "db.log",
    "WARN",
    "[DB] All pool connections are busy — query queued. Consider raising DB_CONNECTION_LIMIT."
  );
});

pool.on("error", (err) => {
  logDbError("Pool error (idle/unexpected connection failure)", err);
});

pool.getConnection((err, connection) => {
  if (err) {
    logDbError(
      "Startup connection FAILED — API process may stay up, but DB routes will fail",
      err
    );
    return;
  }

  connection.ping((pingErr) => {
    if (pingErr) {
      logDbError("Startup ping FAILED", pingErr);
      connection.release();
      return;
    }

    writeLog(
      "db.log",
      "INFO",
      `[DB] Startup OK | threadId=${connection.threadId} | host=${dbConfig.host} | database=${dbConfig.database}`
    );
    connection.release();
  });
});

const db = pool.promise();

const wrapAsync = (target, methodName, label) => {
  const original = target[methodName].bind(target);

  target[methodName] = async (...args) => {
    try {
      return await original(...args);
    } catch (error) {
      const sql =
        typeof args[0] === "string"
          ? args[0]
          : args[0]?.sql || error?.sql || "";
      const snippet = String(sql).replace(/\s+/g, " ").trim().slice(0, 300);
      logDbError(
        `${label} failed${snippet ? `: ${snippet}` : ""}`,
        error
      );
      throw error;
    }
  };
};

wrapAsync(db, "query", "db.query");
wrapAsync(db, "execute", "db.execute");

const originalGetConnection = db.getConnection.bind(db);

db.getConnection = async (...args) => {
  try {
    const connection = await originalGetConnection(...args);
    wrapAsync(connection, "query", "connection.query");
    wrapAsync(connection, "execute", "connection.execute");
    return connection;
  } catch (error) {
    logDbError("getConnection failed", error);
    throw error;
  }
};

db.formatError = explainDbError;
db.logError = logDbError;
db.logsDir = logsDir;

module.exports = db;
