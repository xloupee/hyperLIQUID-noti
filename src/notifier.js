export class TelegramNotifier {
  constructor({ botToken, chatId, fetchImpl = fetch }) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.fetchImpl = fetchImpl;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendAlert({ rule, resolved, price }) {
    const text =
      [
        "Hyperliquid alert",
        `Rule: ${rule.id}`,
        `Market: ${rule.market}`,
        `Symbol: ${rule.symbol}`,
        `Coin: ${resolved.coin}`,
        `Condition: ${rule.direction} ${rule.threshold}`,
        `Price: ${price}`,
      ].join("\n");

    await this.sendMessage({
      chatId: this.chatId,
      text,
    });
  }

  async sendMessage({ chatId, text }) {
    const response = await this.fetchImpl(`${this.baseUrl}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram send failed: ${response.status} ${body}`);
    }

    return response.json();
  }

  async getUpdates({ offset, timeoutSeconds = 25 }) {
    const response = await this.fetchImpl(`${this.baseUrl}/getUpdates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        offset,
        timeout: timeoutSeconds,
        allowed_updates: ["message"],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram getUpdates failed: ${response.status} ${body}`);
    }

    const payload = await response.json();
    return Array.isArray(payload.result) ? payload.result : [];
  }
}
