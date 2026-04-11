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
    this.lastPrices = new Map();
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
    for (const rule of this.rules) {
      const existing = this.rulesByCoin.get(rule.coin) || [];
      existing.push(rule);
      this.rulesByCoin.set(rule.coin, existing);
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

  async handlePrice({ coin, price }) {
    const previousPrice = this.lastPrices.get(coin);
    this.lastPrices.set(coin, price);

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
}
