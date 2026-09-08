const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config();

function env(key, def) {
  const v = process.env[key];
  return v === undefined || v === "" ? def : v;
}

const config = {
  botToken: env("TELEGRAM_BOT_TOKEN", null),
  chatId: env("TELEGRAM_CHAT_ID", ""),
  timezone: env("REPORT_TIMEZONE", "Asia/Jakarta"),
  scheduleMorning: env("MORNING_CRON", "55 8 * * 1-5"),
  scheduleEvening: env("EVENING_CRON", "15 18 * * 1-5"),
  sendMorning: env("MORNING_ENABLED", "1") === "1",
  sendEvening: env("EVENING_ENABLED", "1") === "1",
  server: {
    node: env(
      "STOCKBIT_SERVER_NODE",
      "C:\\Program Files\\nodejs\\node.exe"
    ),
    script: env(
      "STOCKBIT_SERVER_SCRIPT",
      "C:\\Users\\eriks\\Downloads\\stockbit-mcp\\dist\\bin\\stockbit-mcp.js"
    ),
    tools: env("STOCKBIT_TOOLS", "core")
  },
  stateFile: path.join(__dirname, "..", "state.json")
};

module.exports = { config };