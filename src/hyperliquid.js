import { matchesSymbol, normalizeInputSymbol, quoteAliases } from "./rules.js";

export class HyperliquidClient {
  constructor({ apiUrl, fetchImpl = fetch, logger = console }) {
    this.apiUrl = apiUrl.replace(/\/$/u, "");
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async postInfo(body) {
    const response = await this.fetchImpl(`${this.apiUrl}/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hyperliquid info request failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async fetchPerpMeta() {
    return this.postInfo({ type: "meta" });
  }

  async fetchPerpMetaForDex(dex = "") {
    return this.postInfo({ type: "meta", dex });
  }

  async fetchSpotMeta() {
    return this.postInfo({ type: "spotMeta" });
  }

  async fetchPerpAssetCtxs() {
    return this.postInfo({ type: "metaAndAssetCtxs" });
  }

  async fetchSpotAssetCtxs() {
    return this.postInfo({ type: "spotMetaAndAssetCtxs" });
  }

  async fetchAssetContext(rule) {
    if (rule.market === "perp") {
      const [meta, contexts] = await this.postInfo({
        type: "metaAndAssetCtxs",
        dex: rule.dex || "",
      });
      const universe = Array.isArray(meta?.universe) ? meta.universe : [];
      const index = universe.findIndex((item) => item.name === rule.coin);
      return index >= 0 ? contexts[index] || null : null;
    }

    const [meta, contexts] = await this.postInfo({ type: "spotMetaAndAssetCtxs" });
    const universe = Array.isArray(meta?.universe) ? meta.universe : [];
    const index = universe.findIndex((item) => item.name === rule.coin);
    return index >= 0 ? contexts[index] || null : null;
  }

  async fetchContextsForRules(rules) {
    const contexts = new Map();
    const spotRules = rules.filter((rule) => rule.market === "spot");
    const perpDexes = [...new Set(rules.filter((rule) => rule.market === "perp").map((rule) => rule.dex || ""))];

    if (spotRules.length > 0) {
      const [meta, assetContexts] = await this.fetchSpotAssetCtxs();
      assignContexts(contexts, meta?.universe, assetContexts, spotRules);
    }

    for (const dex of perpDexes) {
      const dexRules = rules.filter((rule) => rule.market === "perp" && (rule.dex || "") === dex);
      const [meta, assetContexts] = await this.postInfo({
        type: "metaAndAssetCtxs",
        dex,
      });
      assignContexts(contexts, meta?.universe, assetContexts, dexRules);
    }

    return contexts;
  }

  async resolveRules(rules) {
    const spotMetaPromise = this.fetchSpotMeta();
    const perpDexes = [...new Set(rules.filter((rule) => rule.market === "perp").map((rule) => rule.dex || ""))];
    const perpMetaEntries = await Promise.all(
      perpDexes.map(async (dex) => [dex, await this.fetchPerpMetaForDex(dex)]),
    );
    const perpMetaByDex = new Map(perpMetaEntries);
    const spotMeta = await spotMetaPromise;

    return rules.map((rule) => this.resolveRule(rule, { perpMetaByDex, spotMeta }));
  }

  resolveRule(rule, metadata) {
    if (rule.canonicalCoin) {
      return {
        ...rule,
        coin: rule.canonicalCoin,
        displayName: rule.canonicalCoin,
      };
    }

    if (rule.market === "perp") {
      return this.resolvePerpRule(rule, metadata.perpMetaByDex.get(rule.dex || ""));
    }

    return this.resolveSpotRule(rule, metadata.spotMeta);
  }

  resolvePerpRule(rule, perpMeta) {
    const universe = Array.isArray(perpMeta?.universe) ? perpMeta.universe : [];
    const normalizedInput = normalizeInputSymbol(rule.symbol);
    const candidates = new Set([normalizedInput]);
    if (rule.dex) {
      candidates.add(normalizeInputSymbol(`${rule.dex}:${rule.symbol}`));
    }

    const matched = universe.find((item) =>
      Array.from(candidates).some((candidate) => matchesSymbol(item.name, candidate)),
    );
    if (!matched) {
      const suggestions = suggestMatches(
        universe.map((item) => item.name),
        Array.from(candidates)[0],
      );
      throw new Error(
        `Unable to resolve perp symbol "${rule.symbol}". Suggestions: ${suggestions.join(", ") || "none"}.`,
      );
    }

    return {
      ...rule,
      coin: matched.name,
      displayName: matched.name,
    };
  }

  resolveSpotRule(rule, spotMeta) {
    const universe = Array.isArray(spotMeta?.universe) ? spotMeta.universe : [];
    const candidates = new Set(
      quoteAliases(rule.symbol).flatMap((symbol) => {
        const normalized = normalizeInputSymbol(symbol);
        const slash = normalized.replace(/-/gu, "/");
        return [normalized, slash];
      }),
    );

    const matched = universe.find((item) => {
      if (candidates.has(normalizeInputSymbol(item.name))) {
        return true;
      }
      return Array.from(candidates).some((candidate) => matchesSymbol(item.name, candidate));
    });

    if (!matched) {
      const suggestions = suggestMatches(
        universe.map((item) => item.name),
        Array.from(candidates)[0] || rule.symbol,
      );
      throw new Error(
        `Unable to resolve spot symbol "${rule.symbol}". Add "canonicalCoin" with the Hyperliquid coin (often "@index") if the UI name is remapped. Suggestions: ${suggestions.join(", ") || "none"}.`,
      );
    }

    return {
      ...rule,
      coin: matched.name,
      displayName: matched.name,
    };
  }
}

function suggestMatches(options, input) {
  const normalizedInput = normalizeInputSymbol(input);
  return options
    .map((option) => ({
      option,
      score: scoreCandidate(option, normalizedInput),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .filter((entry) => entry.score > 0)
    .map((entry) => entry.option);
}

function scoreCandidate(option, input) {
  const normalizedOption = normalizeInputSymbol(option);
  if (normalizedOption === input) {
    return 100;
  }
  if (normalizedOption.includes(input) || input.includes(normalizedOption)) {
    return 75;
  }

  let overlap = 0;
  for (const char of input) {
    if (normalizedOption.includes(char)) {
      overlap += 1;
    }
  }
  return overlap;
}

function assignContexts(contextMap, universe, assetContexts, rules) {
  const safeUniverse = Array.isArray(universe) ? universe : [];
  const safeContexts = Array.isArray(assetContexts) ? assetContexts : [];

  for (const rule of rules) {
    const index = safeUniverse.findIndex((item) => item.name === rule.coin);
    if (index >= 0) {
      contextMap.set(rule.coin, safeContexts[index] || null);
    }
  }
}
