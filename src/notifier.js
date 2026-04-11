export class TelegramNotifier {
  constructor({ botToken, chatId, fetchImpl = fetch }) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.fetchImpl = fetchImpl;
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

    const response = await this.fetchImpl(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram send failed: ${response.status} ${body}`);
    }
  }
}
