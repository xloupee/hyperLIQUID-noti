import { loadRulesFromConfig, computeRuleSide, evaluateRuleCrossing } from "./rules.js";

export async function runAlertChecks({ rawConfig, client, notifier, stateStore, logger = console, now = new Date() }) {
  const rules = loadRulesFromConfig(rawConfig);
  if (rules.length === 0) {
    logger.info("No enabled rules found.");
    return [];
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
      timestamp,
    });
    await stateStore.setRuleState(rule.id, createRuleState(price, side, timestamp));
    logger.info(`Alert sent for ${rule.id} at ${price}`);
    results.push({ ruleId: rule.id, status: "alerted" });
  }

  return results;
}

function createRuleState(lastPrice, side, updatedAt) {
  return {
    lastPrice,
    side,
    updatedAt,
  };
}
