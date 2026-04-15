export class SupabaseStateStore {
  constructor(client) {
    this.client = client;
  }

  async getRuleState(ruleId) {
    const row = await this.client.selectSingle("alert_rule_state", {
      rule_id: `eq.${ruleId}`,
    });

    if (!row) {
      return null;
    }

    return {
      lastPrice: Number(row.last_price),
      side: row.side,
      updatedAt: row.updated_at,
    };
  }

  async setRuleState(ruleId, value) {
    await this.client.upsert(
      "alert_rule_state",
      {
        rule_id: ruleId,
        last_price: value.lastPrice,
        side: value.side,
        updated_at: value.updatedAt,
      },
      { returning: "minimal" },
    );
  }
}
