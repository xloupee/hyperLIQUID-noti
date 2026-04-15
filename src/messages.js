export function formatPokeMessage({ rule, resolved, price, timestamp }) {
  return [
    "Hyperliquid alert triggered.",
    `${rule.symbol} (${resolved.coin}) is ${rule.direction} ${rule.threshold}.`,
    `Current mark price: ${price}.`,
    `Market: ${rule.market}${rule.dex ? ` on ${rule.dex}` : ""}.`,
    `Rule: ${rule.id}.`,
    `Time: ${timestamp}.`,
  ].join(" ");
}
