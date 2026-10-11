-- BankSim — 02. Row Level Security + table privileges
--
-- Every table is protected twice:
--   1. Table/column privileges — the app role can only ever touch what it needs.
--      Notably `authenticated` can SELECT accounts and transactions but can never
--      UPDATE balances; balance movements only happen inside SECURITY DEFINER
--      functions (migration 03). Card freeze is the one update users may make,
--      and only on the `status` column. Notification read state: `is_read` only.
--   2. Row Level Security — a user only ever sees their own rows.

alter table public.profiles      enable row level security;
alter table public.accounts      enable row level security;
alter table public.beneficiaries enable row level security;
alter table public.transactions  enable row level security;
alter table public.cards         enable row level security;
alter table public.notifications enable row level security;

-- Privileges: start from a clean slate (Supabase grants broad defaults) and
-- then grant exactly the minimum each role needs.

revoke all on table public.profiles      from anon, authenticated;
revoke all on table public.accounts      from anon, authenticated;
revoke all on table public.beneficiaries from anon, authenticated;
revoke all on table public.transactions  from anon, authenticated;
revoke all on table public.cards         from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

grant select on table public.accounts to authenticated;

grant select, insert, update, delete on table public.beneficiaries to authenticated;

grant select on table public.transactions to authenticated;

grant select on table public.cards to authenticated;
grant update (status) on table public.cards to authenticated;

grant select on table public.notifications to authenticated;
grant update (is_read) on table public.notifications to authenticated;

-- Policies ------------------------------------------------------------------

-- profiles: read and edit your own profile only.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- accounts: read your own accounts only. No insert/update/delete for clients —
-- accounts are created by the onboarding trigger and mutated by RPCs.
drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own"
  on public.accounts for select to authenticated
  using (user_id = (select auth.uid()));

-- beneficiaries: full CRUD on your own list.
drop policy if exists "beneficiaries_select_own" on public.beneficiaries;
create policy "beneficiaries_select_own"
  on public.beneficiaries for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "beneficiaries_insert_own" on public.beneficiaries;
create policy "beneficiaries_insert_own"
  on public.beneficiaries for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "beneficiaries_update_own" on public.beneficiaries;
create policy "beneficiaries_update_own"
  on public.beneficiaries for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "beneficiaries_delete_own" on public.beneficiaries;
create policy "beneficiaries_delete_own"
  on public.beneficiaries for delete to authenticated
  using (user_id = (select auth.uid()));

-- transactions: read rows that belong to one of your accounts. Rows are written
-- only by the SECURITY DEFINER RPCs, so there is no insert/update policy.
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions for select to authenticated
  using (
    exists (
      select 1
      from public.accounts a
      where a.id = transactions.account_id
        and a.user_id = (select auth.uid())
    )
  );

-- cards: read the cards of your own accounts; freeze/unfreeze (status column
-- only, enforced by the column grant above).
drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own"
  on public.cards for select to authenticated
  using (
    exists (
      select 1
      from public.accounts a
      where a.id = cards.account_id
        and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own"
  on public.cards for update to authenticated
  using (
    exists (
      select 1
      from public.accounts a
      where a.id = cards.account_id
        and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.accounts a
      where a.id = cards.account_id
        and a.user_id = (select auth.uid())
    )
  );

-- notifications: read your own; only the read flag is writable (column grant).
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
