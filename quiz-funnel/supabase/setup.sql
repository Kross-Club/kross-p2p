-- Quiz Funnel — esquema base. Corre en el SQL Editor de tu proyecto Supabase nuevo.
-- Idempotente: puedes correrlo varias veces.

-- Leads capturados por el quiz
create table if not exists leads (
  id           uuid primary key default gen_random_uuid(),
  nombre       text,
  phone        text not null,
  answers      jsonb default '{}'::jsonb,
  ai_reply     text,
  created_at   timestamptz default now()
);
create index if not exists leads_phone_idx on leads (phone);

-- Suscripciones Web Push
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references leads(id),
  subscription jsonb not null,
  created_at   timestamptz default now()
);

-- Grabaciones de llamadas (LiveKit Egress)
create table if not exists call_recordings (
  id           uuid primary key default gen_random_uuid(),
  room         text,
  egress_id    text,
  file_path    text,
  status       text default 'recording',   -- recording | done
  created_at   timestamptz default now()
);
create index if not exists call_recordings_egress_idx on call_recordings (egress_id);

-- RLS: las Edge Functions usan service role (bypass). El frontend NO lee estas tablas
-- directamente, así que las dejamos sin políticas públicas (deny por defecto).
alter table leads enable row level security;
alter table push_subscriptions enable row level security;
alter table call_recordings enable row level security;

-- Bucket privado para las grabaciones (créalo también en Storage UI si prefieres)
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;
