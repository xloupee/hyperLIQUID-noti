import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  HYPERLIQUID_API_URL: "https://api.hyperliquid.xyz",
  HYPERLIQUID_WS_URL: "wss://api.hyperliquid.xyz/ws",
  ALERT_RULES_PATH: "./config/alerts.json",
  ALERT_STATE_PATH: "./data/state.json",
};

function parseEnvFile(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function loadDotEnv() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const parsed = parseEnvFile(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
}

export function loadAppConfig() {
  loadDotEnv();

  const config = {
    apiUrl: process.env.HYPERLIQUID_API_URL || DEFAULTS.HYPERLIQUID_API_URL,
    wsUrl: process.env.HYPERLIQUID_WS_URL || DEFAULTS.HYPERLIQUID_WS_URL,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
    rulesPath: path.resolve(process.env.ALERT_RULES_PATH || DEFAULTS.ALERT_RULES_PATH),
    statePath: path.resolve(process.env.ALERT_STATE_PATH || DEFAULTS.ALERT_STATE_PATH),
  };

  if (!config.telegramBotToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  }

  if (!config.telegramChatId) {
    throw new Error("Missing TELEGRAM_CHAT_ID.");
  }

  return config;
}
