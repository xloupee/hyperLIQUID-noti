export class SupabaseRulesStore {
  constructor(client) {
    this.client = client;
  }

  async listEnabledRules() {
    const rows = await this.client.select("alert_rules", {
      enabled: "eq.true",
      order: "created_at.asc",
    });

    return rows.map((row) => ({
      id: row.rule_id,
      market: row.market,
      symbol: row.symbol,
      dex: row.dex || "",
      canonicalCoin: row.canonical_coin || null,
      direction: row.direction,
      threshold: Number(row.threshold),
      enabled: row.enabled !== false,
    }));
  }

  async getRulesConfig({ fallbackRawConfig } = {}) {
    try {
      const rules = await this.listEnabledRules();
      return { rules };
    } catch (error) {
      if (!isMissingRelationError(error)) {
        throw error;
      }
    }

    return fallbackRawConfig;
  }
}

function isMissingRelationError(error) {
  return String(error?.message || "").includes("alert_rules");
}
