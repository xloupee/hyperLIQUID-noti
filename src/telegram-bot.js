function normalizeCommand(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/^\//u, "")
    .split(/\s+/u)[0];
}

export class TelegramBotService {
  constructor({ notifier, app, allowedChatId, logger = console }) {
    this.notifier = notifier;
    this.app = app;
    this.allowedChatId = String(allowedChatId);
    this.logger = logger;
    this.offset = 0;
    this.running = false;
    this.loopPromise = null;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.loopPromise = this.pollLoop();
  }

  async stop() {
    this.running = false;
    await this.loopPromise;
  }

  async pollLoop() {
    while (this.running) {
      try {
        const updates = await this.notifier.getUpdates({
          offset: this.offset,
        });

        for (const update of updates) {
          this.offset = Math.max(this.offset, Number(update.update_id || 0) + 1);
          await this.handleUpdate(update);
        }
      } catch (error) {
        this.logger.error(error);
        await sleep(3000);
      }
    }
  }

  async handleUpdate(update) {
    const message = update.message;
    if (!message?.chat?.id || !message?.text) {
      return;
    }

    const chatId = String(message.chat.id);
    if (chatId !== this.allowedChatId) {
      this.logger.warn(`Ignoring Telegram message from unauthorized chat ${chatId}`);
      return;
    }

    const command = normalizeCommand(message.text);
    if (command === "start" || command === "help") {
      await this.notifier.sendMessage({
        chatId,
        text: this.app.getHelpText(),
      });
      return;
    }

    const reply = await this.app.buildMarketReply(command);
    await this.notifier.sendMessage({
      chatId,
      text: reply,
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
