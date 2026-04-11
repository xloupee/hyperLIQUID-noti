import fs from "node:fs";
import { loadRulesFromConfig, computeRuleSide, evaluateRuleCrossing } from "./rules.js";

export class AlertApp {
  constructor({ client, notifier, stateStore, rulesPath, logger = console }) {
    this.client = client;
    this.notifier = notifier;
    this.stateStore = stateStore;
    this.rulesPath = rulesPath;
    this.logger = logger;
    this.rules = [];
    this.rulesByCoin = new Map();
    this.rulesByCommand = new Map();
    this.lastPrices = new Map();
    this.lastContexts = new Map();
    this.stream = null;
  }

  async init() {
    const rawConfig = JSON.parse(fs.readFileSync(this.rulesPath, "utf8"));
    const loadedRules = loadRulesFromConfig(rawConfig);
    if (loadedRules.length === 0) {
      throw new Error("No enabled rules found.");
    }

    this.stateStore.load();
    this.rules = await this.client.resolveRules(loadedRules);
    this.indexRules();
    this.logResolvedRules();
  }

  indexRules() {
    this.rulesByCoin.clear();
    this.rulesByCommand.clear();
    for (const rule of this.rules) {
      const existing = this.rulesByCoin.get(rule.coin) || [];
      existing.push(rule);
      this.rulesByCoin.set(rule.coin, existing);
      this.rulesByCommand.set(String(rule.symbol).trim().toLowerCase(), rule);
    }
  }

  logResolvedRules() {
    for (const rule of this.rules) {
      this.logger.info(
        `Rule ${rule.id}: ${rule.market} ${rule.symbol} -> ${rule.coin} (${rule.direction} ${rule.threshold})`,
      );
    }
  }

  start() {
    const coins = [...this.rulesByCoin.keys()];
    this.stream = this.client.createPriceStream(coins, {
      onPrice: (update) => {
        void this.handlePrice(update);
      },
      onError: (error) => {
        this.logger.error(error);
      },
    });
    this.stream.start();
  }

  stop() {
    this.stream?.stop();
    this.stateStore.flush();
  }

  async handlePrice({ coin, price, raw }) {
    const previousPrice = this.lastPrices.get(coin);
    this.lastPrices.set(coin, price);
    if (raw?.ctx) {
      this.lastContexts.set(coin, raw.ctx);
    }

    const rules = this.rulesByCoin.get(coin) || [];
    for (const rule of rules) {
      const persisted = this.stateStore.getRuleState(rule.id);
      const baselinePrice =
        previousPrice ?? (persisted && Number.isFinite(persisted.lastPrice) ? persisted.lastPrice : null);

      if (!Number.isFinite(baselinePrice)) {
        this.persistRule(rule.id, price, computeRuleSide(rule, price));
        continue;
      }

      const crossed = evaluateRuleCrossing(rule, baselinePrice, price);
      const side = computeRuleSide(rule, price);

      if (crossed) {
        await this.notifier.sendAlert({
          rule,
          resolved: rule,
          price,
        });
        this.logger.info(`Alert sent for ${rule.id} at ${price}`);
      }

      this.persistRule(rule.id, price, side);
    }
  }

  persistRule(ruleId, lastPrice, side) {
    this.stateStore.setRuleState(ruleId, {
      lastPrice,
      side,
      updatedAt: new Date().toISOString(),
    });
    this.stateStore.flush();
  }

  getHelpText() {
    const commands = [...this.rulesByCommand.keys()].sort().join(", ");
    return `Send one of: ${commands}`;
  }

  async buildMarketReply(command) {
    const rule = this.rulesByCommand.get(String(command).toLowerCase());
    if (!rule) {
      return `${this.getHelpText()}\nUnknown command: ${command}`;
    }

    const context = (await this.getLatestContext(rule)) || {};
    const markPx = firstFiniteNumber(this.lastPrices.get(rule.coin), context.markPx);
    const midPx = firstFiniteNumber(context.midPx);
    const oraclePx = firstFiniteNumber(context.oraclePx);
    const prevDayPx = firstFiniteNumber(context.prevDayPx);
    const funding = firstFiniteNumber(context.funding);
    const dayNtlVlm = firstFiniteNumber(context.dayNtlVlm);
    const persisted = this.stateStore.getRuleState(rule.id);

    return [
      `${rule.symbol} (${rule.coin})`,
      `Market: ${rule.market}${rule.dex ? ` on ${rule.dex}` : ""}`,
      `Mark: ${formatMaybeNumber(markPx)}`,
      `Mid: ${formatMaybeNumber(midPx)}`,
      `Oracle: ${formatMaybeNumber(oraclePx)}`,
      `24h Prev: ${formatMaybeNumber(prevDayPx)}`,
      `Funding: ${formatMaybeNumber(funding, 8)}`,
      `24h Notional Vol: ${formatMaybeNumber(dayNtlVlm, 2)}`,
      `Alert: ${rule.direction} ${rule.threshold}`,
      `Last Alert State: ${persisted?.side || "unknown"}`,
    ].join("\n");
  }

  async getLatestContext(rule) {
    const cached = this.lastContexts.get(rule.coin);
    if (cached) {
      return cached;
    }

    const fresh = await this.client.fetchAssetContext(rule);
    if (fresh) {
      this.lastContexts.set(rule.coin, fresh);
      if (Number.isFinite(Number(fresh.markPx))) {
        this.lastPrices.set(rule.coin, Number(fresh.markPx));
      }
    }
    return fresh;
  }
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function formatMaybeNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}
