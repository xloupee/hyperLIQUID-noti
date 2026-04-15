import test from "node:test";
import assert from "node:assert/strict";
import { runAlertChecks } from "../src/alert-runner.js";

function createMemoryStateStore(initialState = {}) {
  const state = new Map(Object.entries(initialState));
  return {
    async getRuleState(ruleId) {
      return state.get(ruleId) || null;
    },
    async setRuleState(ruleId, value) {
      state.set(ruleId, value);
    },
    dump() {
      return state;
    },
  };
}

function createClient({ rules, contexts }) {
  return {
    async resolveRules() {
      return rules;
    },
    async fetchContextsForRules() {
      return new Map(Object.entries(contexts));
    },
  };
}

test("runAlertChecks alerts once on upward crossing", async () => {
  const sent = [];
  const stateStore = createMemoryStateStore({
    "openai-above": {
      lastPrice: 850,
      side: "below",
      updatedAt: "2026-04-10T00:00:00.000Z",
    },
  });

  const results = await runAlertChecks({
    rawConfig: {
      rules: [
        {
          id: "openai-above",
          market: "perp",
          symbol: "OPENAI",
          dex: "vntl",
          direction: "above",
          threshold: "900",
          enabled: true,
        },
      ],
    },
    client: createClient({
      rules: [
        {
          id: "openai-above",
          market: "perp",
          symbol: "OPENAI",
          dex: "vntl",
          direction: "above",
          threshold: 900,
          enabled: true,
          coin: "vntl:OPENAI",
        },
      ],
      contexts: {
        "vntl:OPENAI": { markPx: "905" },
      },
    }),
    notifier: {
      async sendAlert(payload) {
        sent.push(payload);
      },
    },
    stateStore,
    logger: { info() {}, warn() {} },
    now: new Date("2026-04-11T00:00:00.000Z"),
  });

  assert.equal(sent.length, 1);
  assert.equal(results[0].status, "alerted");
  assert.equal(stateStore.dump().get("openai-above").lastPrice, 905);
});

test("runAlertChecks does not duplicate when price stays on same side", async () => {
  const sent = [];
  const stateStore = createMemoryStateStore({
    "anthropic-below": {
      lastPrice: 780,
      side: "below",
      updatedAt: "2026-04-10T00:00:00.000Z",
    },
  });

  await runAlertChecks({
    rawConfig: {
      rules: [
        {
          id: "anthropic-below",
          market: "perp",
          symbol: "ANTHROPIC",
          dex: "vntl",
          direction: "below",
          threshold: "800",
          enabled: true,
        },
      ],
    },
    client: createClient({
      rules: [
        {
          id: "anthropic-below",
          market: "perp",
          symbol: "ANTHROPIC",
          dex: "vntl",
          direction: "below",
          threshold: 800,
          enabled: true,
          coin: "vntl:ANTHROPIC",
        },
      ],
      contexts: {
        "vntl:ANTHROPIC": { markPx: "790" },
      },
    }),
    notifier: {
      async sendAlert(payload) {
        sent.push(payload);
      },
    },
    stateStore,
    logger: { info() {}, warn() {} },
    now: new Date("2026-04-11T00:00:00.000Z"),
  });

  assert.equal(sent.length, 0);
  assert.equal(stateStore.dump().get("anthropic-below").lastPrice, 790);
});

test("runAlertChecks retries crossing when notification persistence fails", async () => {
  const stateStore = createMemoryStateStore({
    "openai-above": {
      lastPrice: 850,
      side: "below",
      updatedAt: "2026-04-10T00:00:00.000Z",
    },
  });

  await assert.rejects(() =>
    runAlertChecks({
      rawConfig: {
        rules: [
          {
            id: "openai-above",
            market: "perp",
            symbol: "OPENAI",
            dex: "vntl",
            direction: "above",
            threshold: "900",
            enabled: true,
          },
        ],
      },
      client: createClient({
        rules: [
          {
            id: "openai-above",
            market: "perp",
            symbol: "OPENAI",
            dex: "vntl",
            direction: "above",
            threshold: 900,
            enabled: true,
            coin: "vntl:OPENAI",
          },
        ],
        contexts: {
          "vntl:OPENAI": { markPx: "905" },
        },
      }),
      notifier: {
        async sendAlert() {
          throw new Error("notification write failed");
        },
      },
      stateStore,
      logger: { info() {}, warn() {} },
      now: new Date("2026-04-11T00:00:00.000Z"),
    }),
  );

  assert.equal(stateStore.dump().get("openai-above").lastPrice, 850);
});

test("runAlertChecks initializes first-seen state without alerting", async () => {
  const sent = [];
  const stateStore = createMemoryStateStore();

  const results = await runAlertChecks({
    rawConfig: {
      rules: [
        {
          id: "spot-below",
          market: "spot",
          symbol: "PURR-USDC",
          canonicalCoin: "@1",
          direction: "below",
          threshold: "1",
          enabled: true,
        },
      ],
    },
    client: createClient({
      rules: [
        {
          id: "spot-below",
          market: "spot",
          symbol: "PURR-USDC",
          dex: "",
          canonicalCoin: "@1",
          direction: "below",
          threshold: 1,
          enabled: true,
          coin: "@1",
        },
      ],
      contexts: {
        "@1": { markPx: "0.9" },
      },
    }),
    notifier: {
      async sendAlert(payload) {
        sent.push(payload);
      },
    },
    stateStore,
    logger: { info() {}, warn() {} },
    now: new Date("2026-04-11T00:00:00.000Z"),
  });

  assert.equal(sent.length, 0);
  assert.equal(results[0].status, "initialized");
  assert.equal(stateStore.dump().get("spot-below").side, "below");
});

test("runAlertChecks returns no-op when no rules are enabled", async () => {
  const results = await runAlertChecks({
    rawConfig: {
      rules: [],
    },
    client: createClient({
      rules: [],
      contexts: {},
    }),
    notifier: {
      async sendAlert() {
        throw new Error("not used");
      },
    },
    stateStore: createMemoryStateStore(),
    logger: { info() {}, warn() {} },
    now: new Date("2026-04-11T00:00:00.000Z"),
  });

  assert.deepEqual(results, []);
});
