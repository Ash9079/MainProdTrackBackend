const db = require("../config/db");

const getAppSetting = async (
  settingKey,
  fallbackValue
) => {
  const [rows] = await db.query(
    `
    SELECT setting_value
    FROM app_setting
    WHERE setting_key = ?
    LIMIT 1
    `,
    [settingKey]
  );

  return rows[0]?.setting_value ??
    fallbackValue;
};

module.exports = {
  getAppSetting,
};