import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCommandText,
  formatRulesList,
  parseAlertRuleCommand,
} from "../src/alert-rule-commands.js";

test("extractCommandText supports common webhook payload shapes", () => {
  assert.equal(extractCommandText("set OPENAI above 900"), "set OPENAI above 900");
  assert.equal(extractCommandText({ message: "set OPENAI above 900" }), "set OPENAI above 900");
  assert.equal(extractCommandText({ message: { text: "list alerts" } }), "list alerts");
});

test("parseAlertRuleCommand infers vntl perps for plain symbols", () => {
  const command = parseAlertRuleCommand("set OPENAI above 900");

  assert.equal(command.action, "upsert");
  assert.equal(command.rule.market, "perp");
  assert.equal(command.rule.dex, "vntl");
  assert.equal(command.rule.symbol, "OPENAI");
  assert.equal(command.rule.threshold, 900);
  assert.equal(command.rule.id, "perp-vntl-openai-above-900");
});

test("parseAlertRuleCommand infers spot pairs for quoted symbols", () => {
  const command = parseAlertRuleCommand("set HYPE/USDC below 43");

  assert.equal(command.action, "upsert");
  assert.equal(command.rule.market, "spot");
  assert.equal(command.rule.dex, "");
  assert.equal(command.rule.symbol, "HYPE/USDC");
  assert.equal(command.rule.id, "spot-hype-usdc-below-43");
});

test("parseAlertRuleCommand supports removing exact rules", () => {
  const command = parseAlertRuleCommand("remove ANTHROPIC below 900");

  assert.equal(command.action, "remove");
  assert.equal(command.ruleId, "perp-vntl-anthropic-below-900");
});

test("formatRulesList renders compact summaries", () => {
  const message = formatRulesList([
    {
      id: "perp-vntl-openai-above-900",
      market: "perp",
      symbol: "OPENAI",
      dex: "vntl",
      direction: "above",
      threshold: 900,
    },
    {
      id: "spot-hype-usdc-below-43",
      market: "spot",
      symbol: "HYPE/USDC",
      dex: "",
      direction: "below",
      threshold: 43,
    },
  ]);

  assert.match(message, /OPENAI above 900 on vntl/);
  assert.match(message, /HYPE\/USDC below 43 on spot/);
});
