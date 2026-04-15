export function formatPokeMessage({ rule, resolved, price, timestamp }) {
  return `${rule.symbol} crossed ${rule.direction} ${rule.threshold}. Mark price: ${price}. ${timestamp}`;
}
