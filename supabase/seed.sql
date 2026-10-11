-- BankSim — demo seed
--
-- Idempotent: safe to run repeatedly (it rebuilds the demo dataset in place).
-- Creates three demo customers with 30 days of realistic ledger history:
--   aarav@banksim.demo / priya@banksim.demo / rahul@banksim.demo
--   password (all three): BankSim@123
--
-- The history is generated chronologically per account, so every row's
-- balance_after is real, and each account's final balance is exactly the
-- round demo figure (the opening balance is derived backwards from net flow).

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Guard: refuse to run if the demo e-mail addresses belong to other users.
do $$
begin
  if exists (
    select 1 from auth.users
    where email in ('aarav@banksim.demo', 'priya@banksim.demo', 'rahul@banksim.demo')
      and id not in (
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333'
      )
  ) then
    raise exception 'Demo e-mail addresses already belong to different users. Remove those auth users or change the demo addresses.';
  end if;
end $$;

-- Users ----------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'aarav@banksim.demo', extensions.crypt('BankSim@123', extensions.gen_salt('bf')),
   now() - interval '420 days',
   '{"provider":"email","providers":["email"]}'::jsonb,
   jsonb_build_object('full_name', 'Aarav Sharma', 'phone', '+91 98450 12001'),
   now() - interval '420 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'priya@banksim.demo', extensions.crypt('BankSim@123', extensions.gen_salt('bf')),
   now() - interval '400 days',
   '{"provider":"email","providers":["email"]}'::jsonb,
   jsonb_build_object('full_name', 'Priya Nair', 'phone', '+91 99860 33002'),
   now() - interval '400 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'rahul@banksim.demo', extensions.crypt('BankSim@123', extensions.gen_salt('bf')),
   now() - interval '380 days',
   '{"provider":"email","providers":["email"]}'::jsonb,
   jsonb_build_object('full_name', 'Rahul Verma', 'phone', '+91 97400 55003'),
   now() - interval '380 days', now(), '', '', '', '')
on conflict do nothing;

-- Keep the documented demo password valid on every run.
update auth.users
   set encrypted_password = extensions.crypt('BankSim@123', extensions.gen_salt('bf')),
       email_confirmed_at  = coalesce(email_confirmed_at, now())
 where id in (
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333'
 );

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'
  )
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

insert into public.profiles (id, full_name, phone, created_at)
select v.id, v.full_name, v.phone, v.created_at
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'Aarav Sharma', '+91 98450 12001', now() - interval '420 days'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'Priya Nair',   '+91 99860 33002', now() - interval '400 days'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'Rahul Verma',  '+91 97400 55005', now() - interval '380 days')
) as v(id, full_name, phone, created_at)
join auth.users u on u.id = v.id
on conflict (id) do update
  set full_name  = excluded.full_name,
      phone      = excluded.phone,
      created_at = excluded.created_at;

-- Accounts + cards -------------------------------------------------------------
-- Rebuild the demo accounts from scratch. Deleting an account cascades to its
-- cards and ledger rows; balances are filled in by the history pass below.

delete from public.accounts
 where user_id in (
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333'
 );
delete from public.beneficiaries
 where user_id in (
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333'
 );
delete from public.notifications
 where user_id in (
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333'
 );

insert into public.accounts (id, user_id, type, account_number, ifsc, balance, status, created_at)
values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CHECKING', '50100004291', 'BSIM0000001', 0, 'ACTIVE', now() - interval '420 days'),
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'SAVINGS',  '50100004292', 'BSIM0000001', 0, 'ACTIVE', now() - interval '420 days'),
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'CHECKING', '50200005822', 'BSIM0000001', 0, 'ACTIVE', now() - interval '400 days'),
  ('b0000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'SAVINGS',  '50200005823', 'BSIM0000001', 0, 'ACTIVE', now() - interval '400 days'),
  ('c0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'CHECKING', '50300006104', 'BSIM0000001', 0, 'ACTIVE', now() - interval '380 days'),
  ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'SAVINGS',  '50300006105', 'BSIM0000001', 0, 'ACTIVE', now() - interval '380 days');

insert into public.cards (id, account_id, last4, holder_name, expiry_month, expiry_year, status, daily_limit, created_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '4291', 'AARAV SHARMA', 9,  2029, 'ACTIVE',  50000.00, now() - interval '420 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', '5822', 'PRIYA NAIR',   11, 2029, 'ACTIVE',  75000.00, now() - interval '400 days'),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', '6104', 'RAHUL VERMA',  6,  2030, 'ACTIVE', 100000.00, now() - interval '380 days');

-- 30 days of ledger history -----------------------------------------------------
-- Events are generated in IST, applied chronologically per account, and the
-- opening balance of each account is derived so the final balance matches the
-- advertised demo figure exactly.

do $$
declare
  a_check uuid := 'a0000000-0000-4000-8000-000000000001';
  a_save  uuid := 'a0000000-0000-4000-8000-000000000002';
  p_check uuid := 'b0000000-0000-4000-8000-000000000001';
  p_save  uuid := 'b0000000-0000-4000-8000-000000000002';
  r_check uuid := 'c0000000-0000-4000-8000-000000000001';
  r_save  uuid := 'c0000000-0000-4000-8000-000000000002';

  v_targets constant jsonb := jsonb_build_object(
    a_check, 84250.00, a_save, 210500.00,
    p_check, 118940.00, p_save, 305000.00,
    r_check, 196200.00, r_save, 450000.00
  );

  v_ts       timestamptz;
  v_days     int;
  v_hh       int;
  v_mm       int;
  v_amount   numeric(14,2);
  v_memo     text;
  v_pair     record;
  r          record;
  i          int;
  v_balance  numeric(14,2);
  v_net      numeric(14,2);

  v_memos constant text[] := array[
    'UPI — Swiggy order', 'UPI — Zomato', 'UPI — Blinkit groceries',
    'Metro card recharge', 'UPI — Third Wave Coffee', 'UPI — Uber ride',
    'Electricity bill — BESCOM', 'Mobile recharge — Airtel', 'UPI — BigBasket',
    'Fuel — HP Petrol Pump', 'Pharmacy — Apollo', 'UPI — BookMyShow',
    'Gym membership — Cult.fit', 'UPI — KFC', 'Broadband bill — ACT',
    'UPI — DMart'
  ];
begin
  perform setseed(0.2411);

  create temp table seed_events (
    seq         serial primary key,
    occurred_at timestamptz not null,
    from_account uuid,
    to_account   uuid,
    amount       numeric(14,2) not null,
    memo         text,
    ref          text
  ) on commit drop;

  create temp table seed_balances (
    account_id uuid primary key,
    balance    numeric(14,2) not null
  ) on commit drop;

  -- Scripted events: salaries, rent, transfers between the three users,
  -- deposits, savings sweeps, interest.
  for r in
    select * from (values
      (null::uuid, a_check, 92000.00::numeric, 'Salary credit — Acme Corp',      28,  9, 41),
      (a_check, r_check, 18500.00, 'Rent — October',                             26, 10,  5),
      (a_check, a_save,  15000.00, 'Monthly savings transfer',                   11,  8, 15),
      (a_check, p_check,  1250.00, 'Trip advance — Coorg',                        9, 13, 30),
      (null, a_check, 5000.00, 'ATM cash deposit',                               14, 18, 42),
      (null, a_check, 2340.00, 'UPI refund — Amazon',                             6, 16,  5),
      (null, a_save,  1180.00, 'Interest credit — quarterly',                    18,  0,  5),
      (null, p_check, 105000.00, 'Salary credit — Nova Labs',                    27,  9, 32),
      (p_check, r_check, 22000.00, 'Rent — October',                             25, 10, 12),
      (p_check, r_check,  1499.00, 'Groceries split — D-Mart',                    3, 18, 20),
      (p_check, a_check,   850.00, 'Dinner split — Truffles',                    20, 22, 10),
      (p_check, p_save,  20000.00, 'Monthly savings transfer',                   12,  8, 20),
      (null, p_check, 3200.00, 'ATM cash deposit',                               13, 19, 25),
      (null, p_save,  1750.00, 'Interest credit — quarterly',                    18,  0,  8),
      (null, r_check, 140000.00, 'Salary credit — Meridian Tech',                26,  9, 55),
      (r_check, a_check,  640.00, 'Cab share — airport',                          5, 19, 45),
      (r_check, r_save, 25000.00, 'Monthly savings transfer',                    10,  9,  5),
      (null, r_check, 8000.00, 'ATM cash deposit',                               16, 18, 10),
      (null, r_check, 15000.00, 'FD maturity — principal',                        4, 12,  0),
      (null, r_save,  2600.00, 'Interest credit — quarterly',                    18,  0, 12)
    ) as t(fa, ta, amt, memo, days_ago, hh, mm)
  loop
    v_ts := (
      date_trunc('day', now() at time zone 'Asia/Kolkata')
      - make_interval(days => r.days_ago)
      + make_interval(hours => r.hh, mins => r.mm)
    ) at time zone 'Asia/Kolkata';

    insert into seed_events (occurred_at, from_account, to_account, amount, memo)
    values (v_ts, r.fa, r.ta, r.amt, r.memo);
  end loop;

  -- Everyday UPI-style spending, spread across the window.
  for v_pair in
    select * from (values (a_check, 22), (p_check, 20), (r_check, 18)) as t(acct, expense_count)
  loop
    for i in 1..v_pair.expense_count loop
      v_days   := 2 + floor(random() * 26)::int;
      v_hh     := 7 + floor(random() * 16)::int;
      v_mm     := floor(random() * 60)::int;
      v_amount := round((120 + random() * 1480)::numeric, 2);
      v_memo   := v_memos[1 + floor(random() * array_length(v_memos, 1))::int];
      v_ts := (
        date_trunc('day', now() at time zone 'Asia/Kolkata')
        - make_interval(days => v_days)
        + make_interval(hours => v_hh, mins => v_mm)
      ) at time zone 'Asia/Kolkata';

      insert into seed_events (occurred_at, from_account, to_account, amount, memo)
      values (v_ts, v_pair.acct, null, v_amount, v_memo);
    end loop;
  end loop;

  -- References: TXN-YYYYMMDD-XXXXXX, dated to the event's IST calendar day.
  update seed_events
     set ref = 'TXN-'
       || to_char(occurred_at at time zone 'Asia/Kolkata', 'YYYYMMDD')
       || '-'
       || upper(substr(md5(random()::text || seq::text || clock_timestamp()::text), 1, 6))
   where ref is null;

  -- Opening balances: target final balance minus net flow through the account.
  insert into seed_balances (account_id, balance)
  select t.account_id,
         (v_targets ->> t.account_id::text)::numeric
         - coalesce((
             select sum(case when e.to_account = t.account_id then e.amount else -e.amount end)
             from seed_events e
             where e.from_account = t.account_id or e.to_account = t.account_id
           ), 0)
  from (values
    (a_check), (a_save), (p_check), (p_save), (r_check), (r_save)
  ) as t(account_id);

  -- Apply events chronologically, writing the ledger with correct balance_after.
  for r in select * from seed_events order by occurred_at, seq loop
    if r.from_account is not null then
      update seed_balances
         set balance = balance - r.amount
       where account_id = r.from_account
      returning balance into v_balance;

      insert into public.transactions
        (reference, account_id, counterparty_account_id, direction, txn_type, amount, balance_after, memo, status, created_at)
      values
        (r.ref, r.from_account, r.to_account, 'DEBIT',
         case when r.to_account is null then 'WITHDRAWAL' else 'TRANSFER_OUT' end,
         r.amount, v_balance, r.memo, 'COMPLETED', r.occurred_at);
    end if;

    if r.to_account is not null then
      update seed_balances
         set balance = balance + r.amount
       where account_id = r.to_account
      returning balance into v_balance;

      insert into public.transactions
        (reference, account_id, counterparty_account_id, direction, txn_type, amount, balance_after, memo, status, created_at)
      values
        (r.ref, r.to_account, r.from_account, 'CREDIT',
         case when r.from_account is null then 'DEPOSIT' else 'TRANSFER_IN' end,
         r.amount, v_balance, r.memo, 'COMPLETED', r.occurred_at);
    end if;
  end loop;

  -- Publish the final balances.
  update public.accounts a
     set balance = b.balance
    from seed_balances b
   where a.id = b.account_id;
end $$;

-- Beneficiaries (cross-user links so the transfer demo works instantly) --------

insert into public.beneficiaries (user_id, name, account_number, ifsc, nickname) values
  ('11111111-1111-4111-8111-111111111111', 'Rahul Verma',  '50300006104', 'BSIM0000001', 'Landlord'),
  ('11111111-1111-4111-8111-111111111111', 'Priya Nair',   '50200005822', 'BSIM0000001', 'Flatmate'),
  ('22222222-2222-4222-8222-222222222222', 'Aarav Sharma', '50100004291', 'BSIM0000001', 'Aarav — flatmate'),
  ('22222222-2222-4222-8222-222222222222', 'Rahul Verma',  '50300006104', 'BSIM0000001', 'Landlord'),
  ('33333333-3333-4333-8333-333333333333', 'Aarav Sharma', '50100004291', 'BSIM0000001', 'Tenant — flat 402'),
  ('33333333-3333-4333-8333-333333333333', 'Priya Nair',   '50200005822', 'BSIM0000001', 'Tenant — flat 403');

-- Notifications ----------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'Welcome to BankSim',
       'Your accounts are ready. Explore your dashboard, add beneficiaries, and make your first transfer.', true, 419, 12, 0),
      ('11111111-1111-4111-8111-111111111111', 'Salary credited',
       'Your salary of ₹92,000.00 from Acme Corp was credited to account ••••4291.', true, 28, 9, 45),
      ('11111111-1111-4111-8111-111111111111', 'Money received',
       'You received ₹850.00 from Priya Nair (••••5822) — Dinner split — Truffles.', true, 20, 22, 11),
      ('11111111-1111-4111-8111-111111111111', 'Statement ready',
       'Your account statement for the last 30 days is ready to view and export as CSV.', false, 8, 7, 30),
      ('11111111-1111-4111-8111-111111111111', 'Security reminder',
       'BankSim will never ask for your password, OTP, or full card number. Stay alert to fraud.', false, 2, 10, 0),

      ('22222222-2222-4222-8222-222222222222', 'Welcome to BankSim',
       'Your accounts are ready. Explore your dashboard, add beneficiaries, and make your first transfer.', true, 399, 12, 5),
      ('22222222-2222-4222-8222-222222222222', 'Salary credited',
       'Your salary of ₹1,05,000.00 from Nova Labs was credited to account ••••5822.', true, 27, 9, 40),
      ('22222222-2222-4222-8222-222222222222', 'Money received',
       'You received ₹1,250.00 from Aarav Sharma (••••4291) — Trip advance — Coorg.', true, 9, 13, 35),
      ('22222222-2222-4222-8222-222222222222', 'Statement ready',
       'Your account statement for the last 30 days is ready to view and export as CSV.', false, 6, 7, 45),
      ('22222222-2222-4222-8222-222222222222', 'Security reminder',
       'BankSim will never ask for your password, OTP, or full card number. Stay alert to fraud.', false, 1, 9, 15),

      ('33333333-3333-4333-8333-333333333333', 'Welcome to BankSim',
       'Your accounts are ready. Explore your dashboard, add beneficiaries, and make your first transfer.', true, 379, 12, 10),
      ('33333333-3333-4333-8333-333333333333', 'Money received',
       'You received ₹18,500.00 from Aarav Sharma (••••4291) — Rent — October.', true, 26, 10, 20),
      ('33333333-3333-4333-8333-333333333333', 'Money received',
       'You received ₹22,000.00 from Priya Nair (••••5822) — Rent — October.', true, 25, 10, 25),
      ('33333333-3333-4333-8333-333333333333', 'Statement ready',
       'Your account statement for the last 30 days is ready to view and export as CSV.', false, 7, 8, 0),
      ('33333333-3333-4333-8333-333333333333', 'Security reminder',
       'BankSim will never ask for your password, OTP, or full card number. Stay alert to fraud.', false, 1, 8, 20)
    ) as t(user_id, title, body, is_read, days_ago, hh, mm)
  loop
    insert into public.notifications (user_id, title, body, is_read, created_at)
    values (
      r.user_id, r.title, r.body, r.is_read,
      (
        date_trunc('day', now() at time zone 'Asia/Kolkata')
        - make_interval(days => r.days_ago)
        + make_interval(hours => r.hh, mins => r.mm)
      ) at time zone 'Asia/Kolkata'
    );
  end loop;
end $$;

commit;

-- Summary
select
  (select count(*) from public.accounts      where user_id in (select id from auth.users where email like '%@banksim.demo')) as demo_accounts,
  (select count(*) from public.transactions) as ledger_rows,
  (select count(*) from public.beneficiaries) as beneficiaries,
  (select count(*) from public.notifications) as notifications;
