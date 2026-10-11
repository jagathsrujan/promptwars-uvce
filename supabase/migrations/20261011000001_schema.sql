-- BankSim — 01. Schema
-- Core tables for the retail banking simulator: profiles, accounts, beneficiaries,
-- transactions (the ledger), cards, and notifications.
--
-- Money is always numeric(14,2). Balances are never written by clients — see
-- 20261011000003_functions.sql for the SECURITY DEFINER RPCs that move money.

-- profiles ------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  phone      text,
  created_at timestamptz not null default now()
);

-- accounts ------------------------------------------------------------------

create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  type           text not null check (type in ('CHECKING', 'SAVINGS')),
  account_number text not null unique check (account_number ~ '^[0-9]{11}$'),
  ifsc           text not null default 'BSIM0000001' check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  balance        numeric(14,2) not null default 0 check (balance >= 0),
  currency       text not null default 'INR',
  status         text not null default 'ACTIVE' check (status in ('ACTIVE', 'FROZEN', 'CLOSED')),
  created_at     timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);

-- beneficiaries -------------------------------------------------------------

create table if not exists public.beneficiaries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null check (length(trim(name)) between 2 and 60),
  account_number text not null check (account_number ~ '^[0-9]{11}$'),
  ifsc           text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  nickname       text,
  created_at     timestamptz not null default now(),
  unique (user_id, account_number)
);

create index if not exists beneficiaries_user_id_idx on public.beneficiaries (user_id);

-- transactions --------------------------------------------------------------
-- The ledger. One row per account per money movement. A transfer produces TWO
-- rows (DEBIT on the sender's account, CREDIT on the receiver's) that share a
-- single reference — so references are unique per account, not globally.

create table if not exists public.transactions (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null,
  account_id              uuid not null references public.accounts (id) on delete cascade,
  counterparty_account_id uuid references public.accounts (id) on delete set null,
  direction               text not null check (direction in ('CREDIT', 'DEBIT')),
  txn_type                text not null check (txn_type in ('TRANSFER_IN', 'TRANSFER_OUT', 'DEPOSIT', 'WITHDRAWAL')),
  amount                  numeric(14,2) not null check (amount > 0),
  balance_after           numeric(14,2) not null check (balance_after >= 0),
  memo                    text,
  status                  text not null default 'COMPLETED' check (status in ('COMPLETED', 'FAILED', 'PENDING')),
  created_at              timestamptz not null default now(),
  unique (reference, account_id)
);

create index if not exists transactions_account_created_idx
  on public.transactions (account_id, created_at desc);
create index if not exists transactions_reference_idx on public.transactions (reference);

-- cards ---------------------------------------------------------------------

create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  last4        text not null check (last4 ~ '^[0-9]{4}$'),
  network      text not null default 'VISA',
  holder_name  text not null,
  expiry_month smallint not null check (expiry_month between 1 and 12),
  expiry_year  smallint not null check (expiry_year between 2000 and 2100),
  status       text not null default 'ACTIVE' check (status in ('ACTIVE', 'FROZEN')),
  daily_limit  numeric(12,2) not null default 50000.00 check (daily_limit > 0),
  created_at   timestamptz not null default now()
);

create index if not exists cards_account_id_idx on public.cards (account_id);

-- notifications -------------------------------------------------------------

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  body       text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
