const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "..", "logs");

try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch (error) {
  // CWP Node logs often capture stdout only — keep this on console.log.
  console.log("[LOG] Could not create logs directory:", error.message);
}

const formatTimestamp = () =>
  new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  });

const safeSerialize = (value) => {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const writeLog = (fileName, level, message, extra) => {
  const extraText = extra ? ` | ${safeSerialize(extra)}` : "";
  const line = `[${formatTimestamp()}] [${level}] ${message}${extraText}`;

  // CWP Node.js panel typically captures stdout, not stderr.
  console.log(line);

  try {
    fs.appendFileSync(path.join(logsDir, fileName), `${line}\n`);
  } catch (error) {
    console.log("[LOG] Failed to write", fileName, error.message);
  }
};

module.exports = {
  logsDir,
  writeLog,
};
