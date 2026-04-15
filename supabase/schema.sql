create extension if not exists pgcrypto;

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
