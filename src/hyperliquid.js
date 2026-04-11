import { matchesSymbol, normalizeInputSymbol, quoteAliases } from "./rules.js";

export class HyperliquidClient {
  constructor({ apiUrl, wsUrl, fetchImpl = fetch, WebSocketImpl = WebSocket, logger = console }) {
    this.apiUrl = apiUrl.replace(/\/$/u, "");
    this.wsUrl = wsUrl;
    this.fetchImpl = fetchImpl;
    this.WebSocketImpl = WebSocketImpl;
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
    const matched = universe.find((item) => matchesSymbol(item.name, normalizedInput));
    if (!matched) {
      const suggestions = suggestMatches(
        universe.map((item) => item.name),
        normalizedInput,
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

  createPriceStream(coins, { onPrice, onOpen, onError } = {}) {
    return new HyperliquidPriceStream({
      wsUrl: this.wsUrl,
      coins,
      WebSocketImpl: this.WebSocketImpl,
      logger: this.logger,
      onPrice,
      onOpen,
      onError,
    });
  }
}

class HyperliquidPriceStream {
  constructor({ wsUrl, coins, WebSocketImpl, logger, onPrice, onOpen, onError }) {
    this.wsUrl = wsUrl;
    this.coins = [...new Set(coins)];
    this.WebSocketImpl = WebSocketImpl;
    this.logger = logger;
    this.onPrice = onPrice;
    this.onOpen = onOpen;
    this.onError = onError;
    this.socket = null;
    this.reconnectTimer = null;
    this.closedManually = false;
    this.reconnectAttempt = 0;
  }

  start() {
    this.closedManually = false;
    this.connect();
  }

  stop() {
    this.closedManually = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  connect() {
    this.socket = new this.WebSocketImpl(this.wsUrl);
    this.socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.logger.info(`Connected to Hyperliquid websocket at ${this.wsUrl}`);
      for (const coin of this.coins) {
        this.socket.send(
          JSON.stringify({
            method: "subscribe",
            subscription: {
              type: "activeAssetCtx",
              coin,
            },
          }),
        );
      }
      this.onOpen?.();
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.channel !== "activeAssetCtx") {
          return;
        }

        const coin = message.data?.coin;
        const markPx = Number(message.data?.ctx?.markPx);
        if (!coin || !Number.isFinite(markPx)) {
          return;
        }

        this.onPrice?.({ coin, price: markPx, raw: message.data });
      } catch (error) {
        this.onError?.(error);
      }
    });

    this.socket.addEventListener("error", (event) => {
      this.onError?.(new Error(`WebSocket error: ${event.type}`));
    });

    this.socket.addEventListener("close", () => {
      if (this.closedManually) {
        return;
      }
      const delay = computeReconnectDelay(this.reconnectAttempt++);
      this.logger.warn(`Hyperliquid websocket closed. Reconnecting in ${delay}ms.`);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }
}

function computeReconnectDelay(attempt) {
  return Math.min(1000 * 2 ** attempt, 30_000);
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
