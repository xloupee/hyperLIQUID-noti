import { formatPokeMessage } from "./messages.js";

export class SupabaseNotifier {
  constructor(client) {
    this.client = client;
  }

  async sendAlert({ rule, resolved, price, context, timestamp }) {
    await this.client.insert(
      "alert_notifications",
      {
        rule_id: rule.id,
        market: rule.market,
        symbol: rule.symbol,
        dex: rule.dex || null,
        coin: resolved.coin,
        direction: rule.direction,
        threshold: rule.threshold,
        price,
        triggered_at: timestamp,
        context,
        status: "pending",
        message: formatPokeMessage({
          rule,
          resolved,
          price,
          timestamp,
        }),
      },
      { returning: "minimal" },
    );
  }
}
