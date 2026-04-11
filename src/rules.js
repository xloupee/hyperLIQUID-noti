const VALID_MARKETS = new Set(["spot", "perp"]);
const VALID_DIRECTIONS = new Set(["above", "below"]);

export function normalizeInputSymbol(value) {
  return String(value).trim().toUpperCase().replace(/[_\s]+/gu, "-");
}

function normalizeForMatch(value) {
  return normalizeInputSymbol(value).replace(/[/-]/gu, "");
}

function parseThreshold(value, ruleId) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Rule "${ruleId}" has an invalid threshold: ${value}`);
  }
  return parsed;
}

export function loadRulesFromConfig(rawConfig) {
  if (!rawConfig || !Array.isArray(rawConfig.rules)) {
    throw new Error('Alert config must be an object with a "rules" array.');
  }

  const ids = new Set();

  return rawConfig.rules
    .filter((rule) => rule && rule.enabled !== false)
    .map((rule) => {
      if (!rule.id || typeof rule.id !== "string") {
        throw new Error("Each rule must include a string id.");
      }
      if (ids.has(rule.id)) {
        throw new Error(`Duplicate rule id "${rule.id}".`);
      }
      ids.add(rule.id);

      if (!VALID_MARKETS.has(rule.market)) {
        throw new Error(`Rule "${rule.id}" has invalid market "${rule.market}".`);
      }
      if (!VALID_DIRECTIONS.has(rule.direction)) {
        throw new Error(`Rule "${rule.id}" has invalid direction "${rule.direction}".`);
      }
      if (!rule.symbol || typeof rule.symbol !== "string") {
        throw new Error(`Rule "${rule.id}" is missing symbol.`);
      }

      return {
        id: rule.id,
        market: rule.market,
        symbol: rule.symbol,
        dex: rule.dex || "",
        canonicalCoin: rule.canonicalCoin || null,
        direction: rule.direction,
        threshold: parseThreshold(rule.threshold, rule.id),
        enabled: rule.enabled !== false,
      };
    });
}

export function describeCondition(rule) {
  return `${rule.direction} ${rule.threshold}`;
}

export function evaluateRuleCrossing(rule, previousPrice, nextPrice) {
  if (!Number.isFinite(previousPrice) || !Number.isFinite(nextPrice)) {
    return false;
  }

  if (rule.direction === "above") {
    return previousPrice < rule.threshold && nextPrice >= rule.threshold;
  }

  return previousPrice > rule.threshold && nextPrice <= rule.threshold;
}

export function computeRuleSide(rule, price) {
  if (!Number.isFinite(price)) {
    return "unknown";
  }

  if (price === rule.threshold) {
    return "at";
  }

  return price > rule.threshold ? "above" : "below";
}

export function matchesSymbol(candidate, input) {
  const normalizedCandidate = normalizeForMatch(candidate);
  const normalizedInput = normalizeForMatch(input);
  return normalizedCandidate === normalizedInput;
}

export function quoteAliases(value) {
  const normalized = normalizeInputSymbol(value);
  if (normalized.endsWith("-USDH")) {
    return [normalized, normalized.replace(/-USDH$/u, "-USDC")];
  }
  return [normalized];
}
