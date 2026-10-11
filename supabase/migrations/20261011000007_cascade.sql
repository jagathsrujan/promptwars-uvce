-- BankSim — 07. Phase 4 cascade: PayPal-style lists + adaptive profiles.
--
-- Two tables, both RLS-protected with the same posture as firewall_logs:
-- users read their own rows (lists are keyed by salted hashes, so a row
-- reveals nothing raw), only the server writes (service writes happen through
-- SECURITY DEFINER helpers or the server's own client — no client grants
-- beyond select-own; the console is exempt from list checks entirely).
--
-- firewall_lists: allowlist / blocklist / reviewlist membership keyed by
--   acct_hash or device_hash (HMAC_SHA256(DAILY_SALT)[:16] from tokenise.ts).
--   A blocklist hit refuses the request at zero model cost; an allowlist hit
--   feeds the Laya trust conjunction (salary + known device + known
--   beneficiary). Rows expire (blocklist 90d for confirmed fraud, allowlist
--   open-ended for salary anchors).
--
-- user_risk_profiles: per-user adaptive baseline (Welford mean/M2, hour
--   histogram, counterparty/device sets, version). Only APPROVED+settled
--   transfers with 7 clean days update it; CONFIRMED_FRAUD never touches the
--   baseline — it writes the blocklist instead. Learning is frozen to the
--   last version when escalation doubles in an hour (see the tune cron).

create table if not exists public.firewall_lists (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  list            text not null check (list in ('allow', 'block', 'review')),
  key_type        text not null check (key_type in ('acct_hash', 'device_hash')),
  key_hash        text not null check (char_length(key_hash) = 16),
  reason          text not null default '',
  expires_at      timestamptz null,
  created_at      timestamptz not null default now(),
  unique (list, key_type, key_hash)
);

create index if not exists firewall_lists_lookup_idx
  on public.firewall_lists (key_type, key_hash, expires_at);
create index if not exists firewall_lists_user_idx
  on public.firewall_lists (user_id, created_at desc);

create table if not exists public.user_risk_profiles (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  n               integer not null default 0 check (n >= 0),
  amt_mean        numeric(14,2) not null default 0,
  amt_m2          numeric(20,4) not null default 0,
  hour_hist       integer[24] not null default array_fill(0, array[24]),
  counterparties  jsonb not null default '{}'::jsonb check (jsonb_typeof(counterparties) = 'object'),
  device_hashes   jsonb not null default '[]'::jsonb check (jsonb_typeof(device_hashes) = 'array'),
  version         integer not null default 1 check (version >= 1),
  frozen          boolean not null default false,
  updated_at      timestamptz not null default now()
);

-- Phase 4 verdicts: widen the audit table's checks for the new REVIEW status
-- and the LAYA_LOCAL / JEV_CLOUD deciding layers (old rows unaffected).
alter table public.firewall_logs drop constraint if exists firewall_logs_status_check;
alter table public.firewall_logs
  add constraint firewall_logs_status_check
  check (status in ('APPROVED', 'BLOCKED', 'REVIEW'));

alter table public.firewall_logs drop constraint if exists firewall_logs_deciding_layer_check;
alter table public.firewall_logs
  add constraint firewall_logs_deciding_layer_check
  check (deciding_layer in ('L0', 'L1', 'L2', 'L3', 'FAIL_CLOSED', 'LAYA_LOCAL', 'JEV_CLOUD'));

-- Row Level Security + grants -------------------------------------------------

alter table public.firewall_lists enable row level security;
alter table public.user_risk_profiles enable row level security;

revoke all on table public.firewall_lists from anon, authenticated;
revoke all on table public.user_risk_profiles from anon, authenticated;

-- Own-read only: users can see their own list rows and profile (hashes only,
-- no raw PII). No client writes — lists and baselines are server-maintained
-- (writes happen with the server's privileges, never from the browser).
grant select on table public.firewall_lists to authenticated;
grant select on table public.user_risk_profiles to authenticated;

drop policy if exists "firewall_lists_select_own" on public.firewall_lists;
create policy "firewall_lists_select_own"
  on public.firewall_lists for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_risk_profiles_select_own" on public.user_risk_profiles;
create policy "user_risk_profiles_select_own"
  on public.user_risk_profiles for select to authenticated
  using (user_id = (select auth.uid()));
