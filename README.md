# hyperLIQUID-noti

Realtime Hyperliquid price alerts sent through Telegram.

## What It Does

- Watches Hyperliquid spot and perp markets over websocket
- Resolves config symbols to canonical Hyperliquid `coin` identifiers
- Sends Telegram alerts when price crosses a configured threshold
- Persists last-known rule state so restarts do not resend the same crossing immediately

## Setup

1. Copy `.env.example` to `.env`
2. Copy `config/alerts.example.json` to `config/alerts.json`
3. Fill in your Telegram bot token and chat id
4. Update each rule with the symbol and threshold you want

For remapped spot assets, set `canonicalCoin` explicitly. Hyperliquid spot often uses pair names like `PURR/USDC` or `@<index>` instead of UI labels.

For builder-deployed perps from trade URLs like `https://app.hyperliquid.xyz/trade/vntl:OPENAI`, use:

- `market: "perp"`
- `symbol: "OPENAI"`
- `dex: "vntl"`

The docs note that some UI symbols are remapped, so spot assets may still need a canonical `coin` override after checking `spotMeta` or the token details page:

- Hyperliquid info endpoint: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
- Hyperliquid websocket docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket

## Config Shape

```json
{
  "rules": [
    {
      "id": "openai-perp-above-0.50",
      "market": "perp",
      "symbol": "OPENAI",
      "dex": "vntl",
      "direction": "above",
      "threshold": "0.50",
      "enabled": true
    }
  ]
}
```

Fields:

- `market`: `spot` or `perp`
- `symbol`: your human-friendly symbol
- `dex`: optional builder perp dex name such as `vntl`
- `canonicalCoin`: optional exact Hyperliquid coin override
- `direction`: `above` or `below`
- `threshold`: numeric threshold as a string or number
- `enabled`: optional, defaults to `true`

## Run

```bash
npm test
npm run dev
```

Production:

```bash
npm start
```
