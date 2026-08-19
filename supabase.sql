create extension if not exists pgcrypto;

create table if not exists public.project_sessions (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null,
  title text not null,
  summary text not null default '',
  participants jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'closed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_updates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.project_sessions(id) on delete cascade,
  telegram_update_id bigint not null unique,
  telegram_chat_id bigint not null,
  telegram_message_id bigint not null,
  sender_name text not null,
  sent_at timestamptz not null,
  raw_message jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.project_sessions(id) on delete cascade,
  update_id uuid not null references public.telegram_updates(id) on delete cascade,
  kind text not null check (kind in ('decision', 'action', 'issue', 'question', 'evidence')),
  text text not null,
  room text,
  area text,
  status text not null default 'open',
  actor text not null,
  source_sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists project_sessions_chat_last_message_idx
  on public.project_sessions (telegram_chat_id, last_message_at desc);
create index if not exists project_records_session_idx
  on public.project_records (session_id, source_sent_at);

alter table public.project_sessions enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.project_records enable row level security;

revoke all on table public.project_sessions, public.telegram_updates, public.project_records from anon, authenticated;
grant select, insert, update, delete on table public.project_sessions, public.telegram_updates, public.project_records to service_role;

comment on table public.project_sessions is 'Telegram conversations grouped into one daily Singapore-time consolidation.';
comment on table public.telegram_updates is 'Private source messages received from Telegram.';
comment on table public.project_records is 'Structured decisions, actions, issues, questions and evidence extracted from Telegram.';
