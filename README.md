# hyperLIQUID-noti

Hyperliquid price alerts delivered by a scheduled Cloudflare Worker into Supabase, then forwarded to Poke for texting. Alert rules can also be managed from Supabase so Poke can update them without a redeploy.

## What It Does

- Runs once per minute via Cloudflare Cron Triggers
- Resolves spot and perp symbols to canonical Hyperliquid `coin` identifiers
- Fetches current asset context over Hyperliquid HTTP APIs
- Inserts notification rows into Supabase only when price crosses a configured threshold
- Persists per-rule state in Supabase to avoid duplicate alerts
- Forwards inserted notification rows to Poke through a Supabase Edge Function

Alerts are sampled every minute, not streamed. A price that crosses and reverts between runs can be missed.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create or update the Supabase tables:

```bash
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
```

3. Set the Cloudflare Worker secret:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Update [wrangler.jsonc](/Users/kennethjiang/Desktop/hyperLIQUID/wrangler.jsonc:1) with your `SUPABASE_URL`.

4. Set Supabase Edge Function secrets and deploy the functions:

```bash
supabase secrets set POKE_WEBHOOK_URL=https://poke.com/api/v1/inbound/webhook
supabase secrets set POKE_BEARER_TOKEN=replace-with-poke-bearer-token
supabase secrets set RULES_ADMIN_TOKEN=replace-with-admin-token
supabase functions deploy poke-forwarder
supabase functions deploy manage-alert-rules
```

5. Create a Supabase Database Webhook on `public.alert_notifications` for `INSERT` events that targets the deployed `poke-forwarder` function.

6. Point Poke command handling at `manage-alert-rules` and have it send the command text in the request body or a `message` field.

7. Optional: use [config/alerts.json](/Users/kennethjiang/Desktop/hyperLIQUID/config/alerts.json:1) as fallback seed data until `alert_rules` exists in Supabase.

## Rule Sources

- `public.alert_rules` is the primary source of truth for the worker
- [config/alerts.json](/Users/kennethjiang/Desktop/hyperLIQUID/config/alerts.json:1) is only a fallback while the table is missing

## Poke Rule Commands

The `manage-alert-rules` Edge Function supports:

- `set OPENAI above 900`
- `set HYPE/USDC below 43`
- `remove OPENAI above 900`
- `list alerts`

Plain symbols like `OPENAI` and `ANTHROPIC` default to `perp` on `vntl`. Quoted pairs like `HYPE/USDC` default to `spot`.

## Legacy Rule Shape

```json
{
  "rules": [
    {
      "id": "openai-above-900",
      "market": "perp",
      "symbol": "OPENAI",
      "dex": "vntl",
      "direction": "above",
      "threshold": "900",
      "enabled": true
    }
  ]
}
```

Fields:

- `market`: `spot` or `perp`
- `symbol`: human-friendly market symbol
- `dex`: optional builder perp dex such as `vntl`
- `canonicalCoin`: optional exact Hyperliquid coin override
- `direction`: `above` or `below`
- `threshold`: numeric threshold as a string or number
- `enabled`: optional, defaults to `true`

For builder perps from URLs like `https://app.hyperliquid.xyz/trade/vntl:OPENAI`, use `market: "perp"`, `symbol: "OPENAI"`, and `dex: "vntl"`.

## Supabase Schema

The SQL in [supabase/schema.sql](/Users/kennethjiang/Desktop/hyperLIQUID/supabase/schema.sql:1) creates:

- `alert_rules` for active worker rules
- `alert_rule_state` for last seen price/side per rule
- `alert_notifications` for each triggered alert event

Each notification row stores rule metadata, resolved coin, threshold, price, trigger time, raw Hyperliquid context JSON, and a preformatted `message` string.

## Poke Forwarder

The Supabase Edge Function at [supabase/functions/poke-forwarder/index.ts](/Users/kennethjiang/Desktop/hyperLIQUID/supabase/functions/poke-forwarder/index.ts:1):

- accepts the Supabase Database Webhook payload
- extracts the inserted `alert_notifications` row
- forwards it to Poke with a final `message` string plus alert metadata

The Supabase Edge Function at [supabase/functions/manage-alert-rules/index.ts](/Users/kennethjiang/Desktop/hyperLIQUID/supabase/functions/manage-alert-rules/index.ts:1):

- accepts Poke command requests
- parses simple text commands like `set OPENAI above 900`
- writes the resulting rules into `public.alert_rules`

## Local Dev

Run tests:

```bash
npm test
```

Run the Worker locally with scheduled testing enabled:

```bash
npm run dev
```

Then trigger the scheduled handler from the Wrangler local UI or test endpoint.

## Deploy

```bash
npm run deploy
```

## Notes

- The Worker uses direct Supabase REST calls with the service-role key.
- On a notification insert failure, the worker does not advance rule state, so the crossing retries on the next run.

## References

- Supabase Database Webhooks: https://supabase.com/docs/guides/database/webhooks
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Hyperliquid info endpoint: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
