import test from "node:test";
import assert from "node:assert/strict";
import { computeRuleSide, evaluateRuleCrossing, loadRulesFromConfig } from "../src/rules.js";

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
