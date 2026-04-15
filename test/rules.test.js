import test from "node:test";
import assert from "node:assert/strict";
import { computeRuleSide, evaluateRuleCrossing, loadRulesFromConfig } from "../src/rules.js";
import { formatPokeMessage } from "../src/messages.js";
import { HyperliquidClient } from "../src/hyperliquid.js";

test("loadRulesFromConfig filters disabled rules and parses thresholds", () => {
  const rules = loadRulesFromConfig({
    rules: [
      {
        id: "one",
        market: "perp",
        symbol: "BTC",
        direction: "above",
        threshold: "100",
        enabled: true,
      },
      {
        id: "two",
        market: "spot",
        symbol: "PURR-USDC",
        direction: "below",
        threshold: "1",
        enabled: false,
      },
    ],
  });

  assert.equal(rules.length, 1);
  assert.equal(rules[0].threshold, 100);
  assert.equal(rules[0].dex, "");
});

test("evaluateRuleCrossing detects above crossings", () => {
  const crossed = evaluateRuleCrossing(
    { direction: "above", threshold: 10 },
    9.5,
    10,
  );
  assert.equal(crossed, true);
});

test("evaluateRuleCrossing detects below crossings", () => {
  const crossed = evaluateRuleCrossing(
    { direction: "below", threshold: 10 },
    10.5,
    10,
  );
  assert.equal(crossed, true);
});

test("computeRuleSide returns correct side", () => {
  assert.equal(computeRuleSide({ threshold: 10 }, 11), "above");
  assert.equal(computeRuleSide({ threshold: 10 }, 9), "below");
  assert.equal(computeRuleSide({ threshold: 10 }, 10), "at");
});

test("resolveRule matches builder perp using dex and symbol", () => {
  const client = new HyperliquidClient({
    apiUrl: "https://api.hyperliquid.xyz",
    fetchImpl: async () => {
      throw new Error("not used");
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const resolved = client.resolveRule(
    {
      id: "openai",
      market: "perp",
      symbol: "OPENAI",
      dex: "vntl",
      canonicalCoin: null,
      direction: "above",
      threshold: 1,
      enabled: true,
    },
    {
      perpMetaByDex: new Map([
        [
          "vntl",
          {
            universe: [{ name: "vntl:OPENAI" }],
          },
        ],
      ]),
      spotMeta: { universe: [] },
    },
  );

  assert.equal(resolved.coin, "vntl:OPENAI");
});

test("formatPokeMessage renders SMS-ready content", () => {
  const message = formatPokeMessage({
    rule: {
      id: "openai-above-900",
      market: "perp",
      symbol: "OPENAI",
      dex: "vntl",
      threshold: 900,
      direction: "above",
    },
    resolved: {
      coin: "vntl:OPENAI",
    },
    price: 905,
    timestamp: "2026-04-11T00:00:00.000Z",
  });

  assert.match(message, /Hyperliquid alert triggered/);
  assert.match(message, /OPENAI/);
  assert.match(message, /above 900/);
  assert.match(message, /Current mark price: 905/);
});
