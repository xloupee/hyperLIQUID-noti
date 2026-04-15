import test from "node:test";
import assert from "node:assert/strict";
import { formatPokeMessage } from "../src/messages.js";
import { SupabaseNotifier } from "../src/supabase-notifier.js";
import { SupabaseRestClient } from "../src/supabase-rest.js";
import { SupabaseRulesStore } from "../src/supabase-rules-store.js";
import { SupabaseStateStore } from "../src/supabase-state-store.js";

test("SupabaseStateStore reads rule state from the REST client", async () => {
  const stateStore = new SupabaseStateStore({
    async selectSingle(table, query) {
      assert.equal(table, "alert_rule_state");
      assert.deepEqual(query, { rule_id: "eq.openai-above" });
      return {
        rule_id: "openai-above",
        last_price: 901,
        side: "above",
        updated_at: "2026-04-11T00:00:00.000Z",
      };
    },
  });

  const state = await stateStore.getRuleState("openai-above");
  assert.equal(state.lastPrice, 901);
  assert.equal(state.side, "above");
});

test("SupabaseStateStore upserts normalized state rows", async () => {
  const writes = [];
  const stateStore = new SupabaseStateStore({
    async upsert(table, payload, options) {
      writes.push({ table, payload, options });
    },
  });

  await stateStore.setRuleState("openai-above", {
    lastPrice: 905,
    side: "above",
    updatedAt: "2026-04-11T00:00:00.000Z",
  });

  assert.deepEqual(writes, [
    {
      table: "alert_rule_state",
      payload: {
        rule_id: "openai-above",
        last_price: 905,
        side: "above",
        updated_at: "2026-04-11T00:00:00.000Z",
      },
      options: { returning: "minimal" },
    },
  ]);
});

test("SupabaseNotifier inserts rich notification payloads", async () => {
  const writes = [];
  const notifier = new SupabaseNotifier({
    async insert(table, payload, options) {
      writes.push({ table, payload, options });
    },
  });

  await notifier.sendAlert({
    rule: {
      id: "openai-above",
      market: "perp",
      symbol: "OPENAI",
      dex: "vntl",
      direction: "above",
      threshold: 900,
    },
    resolved: {
      coin: "vntl:OPENAI",
    },
    price: 905,
    context: {
      markPx: "905",
      funding: "0.01",
    },
    timestamp: "2026-04-11T00:00:00.000Z",
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, "alert_notifications");
  assert.equal(writes[0].payload.rule_id, "openai-above");
  assert.equal(writes[0].payload.coin, "vntl:OPENAI");
  assert.equal(writes[0].payload.price, 905);
  assert.equal(writes[0].payload.status, "pending");
  assert.equal(
    writes[0].payload.message,
    formatPokeMessage({
      rule: {
        id: "openai-above",
        market: "perp",
        symbol: "OPENAI",
        dex: "vntl",
        direction: "above",
        threshold: 900,
      },
      resolved: {
        coin: "vntl:OPENAI",
      },
      price: 905,
      timestamp: "2026-04-11T00:00:00.000Z",
    }),
  );
  assert.deepEqual(writes[0].options, { returning: "minimal" });
});

test("SupabaseRestClient surfaces non-2xx responses", async () => {
  const client = new SupabaseRestClient({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "bad request" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }),
  });

  await assert.rejects(
    () =>
      client.insert("alert_notifications", {
        rule_id: "openai-above",
      }),
    /Supabase request failed for alert_notifications: 400/,
  );
});

test("SupabaseRestClient deletes rows with filters", async () => {
  let receivedMethod = "";
  let receivedUrl = "";
  const client = new SupabaseRestClient({
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    fetchImpl: async (url, init) => {
      receivedMethod = String(init?.method);
      receivedUrl = String(url);
      return new Response(JSON.stringify([{ rule_id: "perp-vntl-openai-above-900" }]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
  });

  const rows = await client.delete("alert_rules", { rule_id: "eq.perp-vntl-openai-above-900" });
  assert.equal(receivedMethod, "DELETE");
  assert.match(receivedUrl, /alert_rules/);
  assert.deepEqual(rows, [{ rule_id: "perp-vntl-openai-above-900" }]);
});

test("SupabaseRulesStore loads enabled rules from alert_rules", async () => {
  const store = new SupabaseRulesStore({
    async select(table, query) {
      assert.equal(table, "alert_rules");
      assert.deepEqual(query, {
        enabled: "eq.true",
        order: "created_at.asc",
      });
      return [
        {
          rule_id: "perp-vntl-openai-above-900",
          market: "perp",
          symbol: "OPENAI",
          dex: "vntl",
          canonical_coin: null,
          direction: "above",
          threshold: "900",
          enabled: true,
        },
      ];
    },
  });

  const rules = await store.listEnabledRules();
  assert.deepEqual(rules, [
    {
      id: "perp-vntl-openai-above-900",
      market: "perp",
      symbol: "OPENAI",
      dex: "vntl",
      canonicalCoin: null,
      direction: "above",
      threshold: 900,
      enabled: true,
    },
  ]);
});

test("SupabaseRulesStore falls back when alert_rules table is missing", async () => {
  const store = new SupabaseRulesStore({
    async select() {
      throw new Error("Supabase request failed for alert_rules: 404 relation \"public.alert_rules\" does not exist");
    },
  });

  const fallback = {
    rules: [
      {
        id: "fallback-rule",
      },
    ],
  };

  const config = await store.getRulesConfig({
    fallbackRawConfig: fallback,
  });

  assert.deepEqual(config, fallback);
});
