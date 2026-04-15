create extension if not exists pgcrypto;

create table if not exists public.alert_rules (
  rule_id text primary key,
  market text not null,
  symbol text not null,
  dex text,
  canonical_coin text,
  direction text not null,
  threshold numeric not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_rule_state (
  rule_id text primary key,
  last_price numeric not null,
  side text not null,
  updated_at timestamptz not null
);

create table if not exists public.alert_notifications (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null,
  market text not null,
  symbol text not null,
  dex text,
  coin text not null,
  direction text not null,
  threshold numeric not null,
  price numeric not null,
  triggered_at timestamptz not null,
  context jsonb not null,
  message text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists alert_notifications_rule_id_idx
  on public.alert_notifications (rule_id);

create index if not exists alert_notifications_status_idx
  on public.alert_notifications (status);

insert into public.alert_rules (rule_id, market, symbol, dex, canonical_coin, direction, threshold, enabled)
values
  ('perp-vntl-openai-above-900', 'perp', 'OPENAI', 'vntl', null, 'above', 900, true),
  ('perp-vntl-openai-below-800', 'perp', 'OPENAI', 'vntl', null, 'below', 800, true),
  ('perp-vntl-anthropic-above-1000', 'perp', 'ANTHROPIC', 'vntl', null, 'above', 1000, true),
  ('perp-vntl-anthropic-below-900', 'perp', 'ANTHROPIC', 'vntl', null, 'below', 900, true),
  ('spot-hype-usdc-below-43', 'spot', 'HYPE/USDC', null, null, 'below', 43, true)
on conflict (rule_id) do update
set
  market = excluded.market,
  symbol = excluded.symbol,
  dex = excluded.dex,
  canonical_coin = excluded.canonical_coin,
  direction = excluded.direction,
  threshold = excluded.threshold,
  enabled = excluded.enabled,
  updated_at = now();
