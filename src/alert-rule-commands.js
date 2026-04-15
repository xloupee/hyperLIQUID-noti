import { normalizeInputSymbol } from "./rules.js";

const SET_ACTIONS = new Set(["set", "add", "create", "update"]);
const REMOVE_ACTIONS = new Set(["remove", "delete", "disable"]);
const LIST_ACTIONS = new Set(["list", "ls", "show"]);
const HELP_ACTIONS = new Set(["help", "?"]);
const QUOTE_TOKENS = ["USDC", "USDH", "USDT"];

export function extractCommandText(payload) {
  if (typeof payload === "string") {
    return payload.trim();
  }

  const candidates = [
    payload?.message,
    payload?.text,
    payload?.input,
    payload?.body,
    payload?.prompt,
    payload?.data?.message,
    payload?.record?.message,
    payload?.message?.text,
    payload?.message?.content,
    payload?.messages?.[0]?.content,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function parseAlertRuleCommand(input) {
  const text = String(input || "").trim();
  if (!text) {
    return {
      action: "help",
      message: helpMessage(),
    };
  }

  const normalized = text.replace(/\s+/gu, " ").trim();
  const lower = normalized.toLowerCase();

  if (LIST_ACTIONS.has(lower) || lower === "list alerts" || lower === "show alerts") {
    return { action: "list" };
  }

  if (HELP_ACTIONS.has(lower) || lower === "help alerts") {
    return {
      action: "help",
      message: helpMessage(),
    };
  }

  const setMatch = normalized.match(
    /^(set|add|create|update)\s+(?:(spot|perp)\s+)?([a-z0-9:./_-]+)\s+(above|below)\s+([0-9]+(?:\.[0-9]+)?)$/iu,
  );
  if (setMatch && SET_ACTIONS.has(setMatch[1].toLowerCase())) {
    return {
      action: "upsert",
      rule: createRuleFromParts({
        marketHint: setMatch[2],
        rawSymbol: setMatch[3],
        direction: setMatch[4].toLowerCase(),
        threshold: setMatch[5],
      }),
    };
  }

  const removeMatch = normalized.match(
    /^(remove|delete|disable)\s+(?:(spot|perp)\s+)?([a-z0-9:./_-]+)\s+(above|below)\s+([0-9]+(?:\.[0-9]+)?)$/iu,
  );
  if (removeMatch && REMOVE_ACTIONS.has(removeMatch[1].toLowerCase())) {
    const rule = createRuleFromParts({
      marketHint: removeMatch[2],
      rawSymbol: removeMatch[3],
      direction: removeMatch[4].toLowerCase(),
      threshold: removeMatch[5],
    });

    return {
      action: "remove",
      rule,
      ruleId: rule.id,
    };
  }

  return {
    action: "help",
    message: helpMessage(),
  };
}

export function formatRulesList(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return "No active alerts.";
  }

  const lines = rules
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((rule) => `${rule.symbol} ${rule.direction} ${rule.threshold}${describeRuleMarket(rule)}`);

  return `Active alerts: ${lines.join(" | ")}`;
}

export function formatRuleConfirmation(action, rule) {
  if (action === "removed") {
    return `Removed alert: ${rule.symbol} ${rule.direction} ${rule.threshold}${describeRuleMarket(rule)}.`;
  }

  return `Saved alert: ${rule.symbol} ${rule.direction} ${rule.threshold}${describeRuleMarket(rule)}.`;
}

export function helpMessage() {
  return "Commands: set OPENAI above 900 | set HYPE/USDC below 43 | remove OPENAI above 900 | list alerts";
}

export function createRuleId({ market, symbol, dex, direction, threshold }) {
  const normalizedSymbol = normalizeInputSymbol(symbol)
    .replace(/[:/]/gu, "-")
    .toLowerCase();
  const normalizedThreshold = String(threshold).replace(/\./gu, "-");
  const dexPrefix = dex ? `${dex.toLowerCase()}-` : "";
  return `${market}-${dexPrefix}${normalizedSymbol}-${direction}-${normalizedThreshold}`;
}

function createRuleFromParts({ marketHint, rawSymbol, direction, threshold }) {
  const inferred = inferMarketAndSymbol(rawSymbol, marketHint);

  return {
    id: createRuleId({
      market: inferred.market,
      symbol: inferred.symbol,
      dex: inferred.dex,
      direction,
      threshold,
    }),
    market: inferred.market,
    symbol: inferred.symbol,
    dex: inferred.dex,
    canonicalCoin: null,
    direction,
    threshold: Number(threshold),
    enabled: true,
  };
}

function inferMarketAndSymbol(rawSymbol, marketHint) {
  const hint = marketHint ? marketHint.toLowerCase() : "";
  const symbolInput = String(rawSymbol).trim();

  if (symbolInput.includes(":")) {
    const [dex, symbol] = symbolInput.split(":");
    return {
      market: hint || "perp",
      symbol: normalizeInputSymbol(symbol),
      dex: dex || "",
    };
  }

  const normalizedSymbol = normalizeInputSymbol(symbolInput);

  if (hint === "spot") {
    return { market: "spot", symbol: normalizedSymbol.replace(/-/gu, "/"), dex: "" };
  }

  if (hint === "perp") {
    return { market: "perp", symbol: normalizedSymbol, dex: "vntl" };
  }

  const looksSpot = QUOTE_TOKENS.some(
    (quote) => normalizedSymbol.endsWith(`-${quote}`) || normalizedSymbol.endsWith(`/${quote}`),
  );

  if (looksSpot) {
    return {
      market: "spot",
      symbol: normalizedSymbol.replace(/-/gu, "/"),
      dex: "",
    };
  }

  return {
    market: "perp",
    symbol: normalizedSymbol,
    dex: "vntl",
  };
}

function describeRuleMarket(rule) {
  if (rule.market === "spot") {
    return " on spot";
  }

  if (rule.dex) {
    return ` on ${rule.dex}`;
  }

  return " on perp";
}
