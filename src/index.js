import fs from "node:fs";
import { AlertApp } from "./app.js";
import { loadAppConfig } from "./config.js";
import { HyperliquidClient } from "./hyperliquid.js";
import { TelegramNotifier } from "./notifier.js";
import { JsonStateStore } from "./state-store.js";

function ensureRulesFile(pathname) {
  if (!fs.existsSync(pathname)) {
    throw new Error(
      `Missing rules file at ${pathname}. Copy config/alerts.example.json to config/alerts.json and update it.`,
    );
  }
}

async function main() {
  const config = loadAppConfig();
  ensureRulesFile(config.rulesPath);

  const client = new HyperliquidClient({
    apiUrl: config.apiUrl,
    wsUrl: config.wsUrl,
  });
  const notifier = new TelegramNotifier({
    botToken: config.telegramBotToken,
    chatId: config.telegramChatId,
  });
  const stateStore = new JsonStateStore(config.statePath);

  const app = new AlertApp({
    client,
    notifier,
    stateStore,
    rulesPath: config.rulesPath,
  });

  await app.init();
  app.start();

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      app.stop();
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
