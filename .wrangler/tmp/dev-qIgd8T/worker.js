var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// config/alerts.json
var alerts_default = {
  rules: [
    {
      id: "openai-above-900",
      market: "perp",
      symbol: "OPENAI",
      dex: "vntl",
      direction: "above",
      threshold: "900",
      enabled: true
    },
    {
      id: "openai-below-800",
      market: "perp",
      symbol: "OPENAI",
      dex: "vntl",
      direction: "below",
      threshold: "800",
      enabled: true
    },
    {
      id: "anthropic-above-900",
      market: "perp",
      symbol: "ANTHROPIC",
      dex: "vntl",
      direction: "above",
      threshold: "900",
      enabled: true
    },
    {
      id: "anthropic-below-800",
      market: "perp",
      symbol: "ANTHROPIC",
      dex: "vntl",
      direction: "below",
      threshold: "800",
      enabled: true
    }
  ]
};

// src/config.js
var DEFAULT_API_URL = "https://api.hyperliquid.xyz";
function getAlertsConfig() {
  return alerts_default;
}
__name(getAlertsConfig, "getAlertsConfig");
function loadWorkerConfig(env) {
  if (!env?.SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL.");
  }
  if (!env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }
  return {
    apiUrl: env.HYPERLIQUID_API_URL || DEFAULT_API_URL,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY
  };
}
__name(loadWorkerConfig, "loadWorkerConfig");

// src/rules.js
var VALID_MARKETS = /* @__PURE__ */ new Set(["spot", "perp"]);
var VALID_DIRECTIONS = /* @__PURE__ */ new Set(["above", "below"]);
function normalizeInputSymbol(value) {
  return String(value).trim().toUpperCase().replace(/[_\s]+/gu, "-");
}
__name(normalizeInputSymbol, "normalizeInputSymbol");
function normalizeForMatch(value) {
  return normalizeInputSymbol(value).replace(/[/-]/gu, "");
}
__name(normalizeForMatch, "normalizeForMatch");
function parseThreshold(value, ruleId) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Rule "${ruleId}" has an invalid threshold: ${value}`);
  }
  return parsed;
}
__name(parseThreshold, "parseThreshold");
function loadRulesFromConfig(rawConfig) {
  if (!rawConfig || !Array.isArray(rawConfig.rules)) {
    throw new Error('Alert config must be an object with a "rules" array.');
  }
  const ids = /* @__PURE__ */ new Set();
  return rawConfig.rules.filter((rule) => rule && rule.enabled !== false).map((rule) => {
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
      enabled: rule.enabled !== false
    };
  });
}
__name(loadRulesFromConfig, "loadRulesFromConfig");
function evaluateRuleCrossing(rule, previousPrice, nextPrice) {
  if (!Number.isFinite(previousPrice) || !Number.isFinite(nextPrice)) {
    return false;
  }
  if (rule.direction === "above") {
    return previousPrice < rule.threshold && nextPrice >= rule.threshold;
  }
  return previousPrice > rule.threshold && nextPrice <= rule.threshold;
}
__name(evaluateRuleCrossing, "evaluateRuleCrossing");
function computeRuleSide(rule, price) {
  if (!Number.isFinite(price)) {
    return "unknown";
  }
  if (price === rule.threshold) {
    return "at";
  }
  return price > rule.threshold ? "above" : "below";
}
__name(computeRuleSide, "computeRuleSide");
function matchesSymbol(candidate, input) {
  const normalizedCandidate = normalizeForMatch(candidate);
  const normalizedInput = normalizeForMatch(input);
  return normalizedCandidate === normalizedInput;
}
__name(matchesSymbol, "matchesSymbol");
function quoteAliases(value) {
  const normalized = normalizeInputSymbol(value);
  if (normalized.endsWith("-USDH")) {
    return [normalized, normalized.replace(/-USDH$/u, "-USDC")];
  }
  return [normalized];
}
__name(quoteAliases, "quoteAliases");

// src/hyperliquid.js
var HyperliquidClient = class {
  static {
    __name(this, "HyperliquidClient");
  }
  constructor({ apiUrl, fetchImpl = fetch, logger = console }) {
    this.apiUrl = apiUrl.replace(/\/$/u, "");
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }
  async postInfo(body) {
    const response = await this.fetchImpl(`${this.apiUrl}/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
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
      const [meta2, contexts2] = await this.postInfo({
        type: "metaAndAssetCtxs",
        dex: rule.dex || ""
      });
      const universe2 = Array.isArray(meta2?.universe) ? meta2.universe : [];
      const index2 = universe2.findIndex((item) => item.name === rule.coin);
      return index2 >= 0 ? contexts2[index2] || null : null;
    }
    const [meta, contexts] = await this.postInfo({ type: "spotMetaAndAssetCtxs" });
    const universe = Array.isArray(meta?.universe) ? meta.universe : [];
    const index = universe.findIndex((item) => item.name === rule.coin);
    return index >= 0 ? contexts[index] || null : null;
  }
  async fetchContextsForRules(rules) {
    const contexts = /* @__PURE__ */ new Map();
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
        dex
      });
      assignContexts(contexts, meta?.universe, assetContexts, dexRules);
    }
    return contexts;
  }
  async resolveRules(rules) {
    const spotMetaPromise = this.fetchSpotMeta();
    const perpDexes = [...new Set(rules.filter((rule) => rule.market === "perp").map((rule) => rule.dex || ""))];
    const perpMetaEntries = await Promise.all(
      perpDexes.map(async (dex) => [dex, await this.fetchPerpMetaForDex(dex)])
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
        displayName: rule.canonicalCoin
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
    const candidates = /* @__PURE__ */ new Set([normalizedInput]);
    if (rule.dex) {
      candidates.add(normalizeInputSymbol(`${rule.dex}:${rule.symbol}`));
    }
    const matched = universe.find(
      (item) => Array.from(candidates).some((candidate) => matchesSymbol(item.name, candidate))
    );
    if (!matched) {
      const suggestions = suggestMatches(
        universe.map((item) => item.name),
        Array.from(candidates)[0]
      );
      throw new Error(
        `Unable to resolve perp symbol "${rule.symbol}". Suggestions: ${suggestions.join(", ") || "none"}.`
      );
    }
    return {
      ...rule,
      coin: matched.name,
      displayName: matched.name
    };
  }
  resolveSpotRule(rule, spotMeta) {
    const universe = Array.isArray(spotMeta?.universe) ? spotMeta.universe : [];
    const candidates = new Set(
      quoteAliases(rule.symbol).flatMap((symbol) => {
        const normalized = normalizeInputSymbol(symbol);
        const slash = normalized.replace(/-/gu, "/");
        return [normalized, slash];
      })
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
        Array.from(candidates)[0] || rule.symbol
      );
      throw new Error(
        `Unable to resolve spot symbol "${rule.symbol}". Add "canonicalCoin" with the Hyperliquid coin (often "@index") if the UI name is remapped. Suggestions: ${suggestions.join(", ") || "none"}.`
      );
    }
    return {
      ...rule,
      coin: matched.name,
      displayName: matched.name
    };
  }
};
function suggestMatches(options, input) {
  const normalizedInput = normalizeInputSymbol(input);
  return options.map((option) => ({
    option,
    score: scoreCandidate(option, normalizedInput)
  })).sort((left, right) => right.score - left.score).slice(0, 5).filter((entry) => entry.score > 0).map((entry) => entry.option);
}
__name(suggestMatches, "suggestMatches");
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
__name(scoreCandidate, "scoreCandidate");
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
__name(assignContexts, "assignContexts");

// src/alert-runner.js
async function runAlertChecks({ rawConfig, client, notifier, stateStore, logger = console, now = /* @__PURE__ */ new Date() }) {
  const rules = loadRulesFromConfig(rawConfig);
  if (rules.length === 0) {
    throw new Error("No enabled rules found.");
  }
  const resolvedRules = await client.resolveRules(rules);
  const contextByCoin = await client.fetchContextsForRules(resolvedRules);
  const timestamp = now.toISOString();
  const results = [];
  for (const rule of resolvedRules) {
    const context = contextByCoin.get(rule.coin);
    const price = Number(context?.markPx);
    if (!Number.isFinite(price)) {
      logger.warn(`Skipping ${rule.id}: missing markPx for ${rule.coin}`);
      results.push({ ruleId: rule.id, status: "skipped" });
      continue;
    }
    const persisted = await stateStore.getRuleState(rule.id);
    const previousPrice = Number(persisted?.lastPrice);
    const side = computeRuleSide(rule, price);
    if (!Number.isFinite(previousPrice)) {
      await stateStore.setRuleState(rule.id, createRuleState(price, side, timestamp));
      results.push({ ruleId: rule.id, status: "initialized" });
      continue;
    }
    if (!evaluateRuleCrossing(rule, previousPrice, price)) {
      await stateStore.setRuleState(rule.id, createRuleState(price, side, timestamp));
      results.push({ ruleId: rule.id, status: "unchanged" });
      continue;
    }
    await notifier.sendAlert({
      rule,
      resolved: rule,
      price,
      context,
      timestamp
    });
    await stateStore.setRuleState(rule.id, createRuleState(price, side, timestamp));
    logger.info(`Alert sent for ${rule.id} at ${price}`);
    results.push({ ruleId: rule.id, status: "alerted" });
  }
  return results;
}
__name(runAlertChecks, "runAlertChecks");
function createRuleState(lastPrice, side, updatedAt) {
  return {
    lastPrice,
    side,
    updatedAt
  };
}
__name(createRuleState, "createRuleState");

// src/messages.js
function formatPokeMessage({ rule, resolved, price, timestamp }) {
  return [
    "Hyperliquid alert triggered.",
    `${rule.symbol} (${resolved.coin}) is ${rule.direction} ${rule.threshold}.`,
    `Current mark price: ${price}.`,
    `Market: ${rule.market}${rule.dex ? ` on ${rule.dex}` : ""}.`,
    `Rule: ${rule.id}.`,
    `Time: ${timestamp}.`
  ].join(" ");
}
__name(formatPokeMessage, "formatPokeMessage");

// src/supabase-notifier.js
var SupabaseNotifier = class {
  static {
    __name(this, "SupabaseNotifier");
  }
  constructor(client) {
    this.client = client;
  }
  async sendAlert({ rule, resolved, price, context, timestamp }) {
    await this.client.insert(
      "alert_notifications",
      {
        rule_id: rule.id,
        market: rule.market,
        symbol: rule.symbol,
        dex: rule.dex || null,
        coin: resolved.coin,
        direction: rule.direction,
        threshold: rule.threshold,
        price,
        triggered_at: timestamp,
        context,
        status: "pending",
        message: formatPokeMessage({
          rule,
          resolved,
          price,
          timestamp
        })
      },
      { returning: "minimal" }
    );
  }
};

// src/supabase-rest.js
var SupabaseRestClient = class {
  static {
    __name(this, "SupabaseRestClient");
  }
  constructor({ url, serviceRoleKey, fetchImpl = fetch }) {
    this.baseUrl = url.replace(/\/$/u, "");
    this.serviceRoleKey = serviceRoleKey;
    this.fetchImpl = fetchImpl;
  }
  async selectSingle(table, query) {
    const response = await this.request(table, {
      method: "GET",
      query: {
        ...query,
        select: "*",
        limit: "1"
      },
      headers: {
        Accept: "application/vnd.pgrst.object+json"
      },
      allowStatuses: [406]
    });
    if (response.status === 406) {
      return null;
    }
    return response.json();
  }
  async upsert(table, payload, options = {}) {
    const query = {};
    if (options.returning === "minimal") {
      query.select = "";
    }
    await this.request(table, {
      method: "POST",
      query,
      headers: {
        Prefer: buildPreferHeader({
          resolution: "merge-duplicates",
          returning: options.returning || "representation"
        })
      },
      body: payload
    });
  }
  async insert(table, payload, options = {}) {
    const response = await this.request(table, {
      method: "POST",
      headers: {
        Prefer: buildPreferHeader({
          returning: options.returning || "representation"
        })
      },
      body: payload
    });
    if (options.returning === "minimal") {
      return null;
    }
    return response.json();
  }
  async request(table, { method, query, headers = {}, body, allowStatuses = [] } = {}) {
    const url = new URL(`${this.baseUrl}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== void 0 && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers
      },
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    if (response.ok || allowStatuses.includes(response.status)) {
      return response;
    }
    const errorText = await response.text();
    throw new Error(`Supabase request failed for ${table}: ${response.status} ${errorText}`);
  }
};
function buildPreferHeader({ resolution, returning }) {
  const values = [];
  if (resolution) {
    values.push(`resolution=${resolution}`);
  }
  if (returning) {
    values.push(`return=${returning}`);
  }
  return values.join(",");
}
__name(buildPreferHeader, "buildPreferHeader");

// src/supabase-state-store.js
var SupabaseStateStore = class {
  static {
    __name(this, "SupabaseStateStore");
  }
  constructor(client) {
    this.client = client;
  }
  async getRuleState(ruleId) {
    const row = await this.client.selectSingle("alert_rule_state", {
      rule_id: `eq.${ruleId}`
    });
    if (!row) {
      return null;
    }
    return {
      lastPrice: Number(row.last_price),
      side: row.side,
      updatedAt: row.updated_at
    };
  }
  async setRuleState(ruleId, value) {
    await this.client.upsert(
      "alert_rule_state",
      {
        rule_id: ruleId,
        last_price: value.lastPrice,
        side: value.side,
        updated_at: value.updatedAt
      },
      { returning: "minimal" }
    );
  }
};

// src/worker.js
var worker_default = {
  async scheduled(controller, env, ctx) {
    const config = loadWorkerConfig(env);
    const client = new HyperliquidClient({
      apiUrl: config.apiUrl
    });
    const supabase = new SupabaseRestClient({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey
    });
    const notifier = new SupabaseNotifier(supabase);
    const stateStore = new SupabaseStateStore(supabase);
    ctx.waitUntil(
      runAlertChecks({
        rawConfig: getAlertsConfig(),
        client,
        notifier,
        stateStore,
        now: new Date(controller.scheduledTime)
      })
    );
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-scheduled.ts
var scheduled = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  const url = new URL(request.url);
  if (url.pathname === "/__scheduled") {
    const cron = url.searchParams.get("cron") ?? "";
    await middlewareCtx.dispatch("scheduled", { cron });
    return new Response("Ran scheduled event");
  }
  const resp = await middlewareCtx.next(request, env);
  if (request.headers.get("referer")?.endsWith("/__scheduled") && url.pathname === "/favicon.ico" && resp.status === 500) {
    return new Response(null, { status: 404 });
  }
  return resp;
}, "scheduled");
var middleware_scheduled_default = scheduled;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-An0EGl/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_scheduled_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-An0EGl/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
