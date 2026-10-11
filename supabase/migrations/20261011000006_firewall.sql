-- BankSim — 06. Blue-team firewall audit log.
--
-- Every firewall decision (chat message, transfer-form memo, console run,
-- confirmed execution) is persisted here with its full verdict JSON, the
-- per-layer signal breakdown and the latency — this is what the Firewall
-- Console renders, and what the rate limiter / lockout counts.
--
-- Like the rest of BankSim: RLS on, explicit grants only.
--   * users can read and append their own decisions (the server writes them
--     with the caller's session — no service role),
--   * nothing is updatable or deletable from a client: an audit trail you can
--     rewrite is not an audit trail.

create table if not exists public.firewall_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  surface         text not null check (surface in ('chat', 'memo', 'console', 'confirm')),
  input           text not null check (char_length(input) <= 4200),
  status          text not null check (status in ('APPROVED', 'BLOCKED')),
  risk_score      integer not null check (risk_score between 0 and 100),
  threat_category text not null check (threat_category in (
    'NONE', 'PROMPT_INJECTION', 'JAILBREAK', 'ROLEPLAY_ATTACK', 'HIDDEN_INSTRUCTION',
    'DATA_EXFILTRATION', 'SOCIAL_ENGINEERING', 'AMBIGUOUS_INPUT', 'VALIDATION_FAILURE',
    'RATE_LIMIT'
  )),
  explanation     text not null,
  deciding_layer  text not null check (deciding_layer in ('L0', 'L1', 'L2', 'L3', 'FAIL_CLOSED')),
  signals         jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
  layer_details   jsonb not null default '{}'::jsonb check (jsonb_typeof(layer_details) = 'object'),
  intent          text check (intent is null or intent in (
    'BALANCE_CHECK', 'TRANSFER', 'DEPOSIT', 'WITHDRAW', 'TRANSACTION_HISTORY',
    'ADD_BENEFICIARY', 'SET_CARD_STATUS'
  )),
  latency_ms      integer not null default 0 check (latency_ms between 0 and 600000),
  -- true when a tool actually ran under this decision (confirmed executions)
  executed        boolean not null default false,
  -- set on RATE_LIMIT blocks and lockouts: flagged for review
  audit           boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists firewall_logs_user_created_idx
  on public.firewall_logs (user_id, created_at desc);
create index if not exists firewall_logs_user_status_idx
  on public.firewall_logs (user_id, status, created_at desc);

-- Row Level Security + grants -------------------------------------------------

alter table public.firewall_logs enable row level security;

revoke all on table public.firewall_logs from anon, authenticated;

grant select, insert on table public.firewall_logs to authenticated;

drop policy if exists "firewall_logs_select_own" on public.firewall_logs;
create policy "firewall_logs_select_own"
  on public.firewall_logs for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "firewall_logs_insert_own" on public.firewall_logs;
create policy "firewall_logs_insert_own"
  on public.firewall_logs for insert to authenticated
  with check (user_id = (select auth.uid()));
