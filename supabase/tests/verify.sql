-- BankSim — SQL verification suite
--
-- Run with psql after applying migrations and seed (the seed should be run
-- TWICE before this file to also prove idempotency):
--
--   psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/tests/local_harness.sql
--   psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000001_schema.sql
--   psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000002_rls.sql
--   psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261011000003_functions.sql
--   psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/seed.sql
--   psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/seed.sql
--   psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/tests/verify.sql
--
-- Any failed assertion raises an exception; "PASS:" notices mark completed checks.

\set ON_ERROR_STOP on

-- 1. Seed shape + ledger integrity --------------------------------------------

do $$
declare v int;
begin
  select count(*) into v from auth.users where email like '%@banksim.demo';
  if v <> 3 then raise exception 'Expected 3 demo users, found %', v; end if;

  select count(*) into v from public.accounts;
  if v <> 6 then raise exception 'Expected 6 demo accounts (seed ran twice?), found %', v; end if;

  select count(*) into v from public.cards;
  if v <> 3 then raise exception 'Expected 3 demo cards, found %', v; end if;

  select count(*) into v from public.beneficiaries;
  if v <> 6 then raise exception 'Expected 6 demo beneficiaries, found %', v; end if;

  select count(*) into v from public.notifications;
  if v <> 15 then raise exception 'Expected 15 demo notifications, found %', v; end if;

  -- Every account's balance equals the balance_after of its latest ledger row.
  select count(*) into v
  from public.accounts a
  where a.balance <> (
    select t.balance_after from public.transactions t
    where t.account_id = a.id order by t.created_at desc, t.id desc limit 1
  );
  if v <> 0 then raise exception 'Ledger inconsistency: % account(s) with balance != latest balance_after', v; end if;

  select count(*) into v from public.transactions;
  if v <> 89 then raise exception 'Expected 89 ledger rows, found % (seed ran twice?)', v; end if;

  -- Ledger rows link to valid counterparties (18 transfer rows pair with their
  -- mirror image on the other account).
  select count(*) into v
  from public.transactions t
  join public.transactions p
    on p.reference = t.reference
   and p.account_id = t.counterparty_account_id
  where t.txn_type in ('TRANSFER_OUT', 'TRANSFER_IN');
  if v <> 18 then raise exception 'Expected 18 paired transfer rows, found %', v; end if;

  -- References follow TXN-YYYYMMDD-XXXXXX.
  select count(*) into v from public.transactions where reference !~ '^TXN-[0-9]{8}-[0-9A-F]{6}$';
  if v <> 0 then raise exception '% transaction(s) with malformed references', v; end if;

  -- Transfers always appear as exactly two rows sharing one reference.
  select count(*) into v
  from (
    select reference from public.transactions
    where txn_type in ('TRANSFER_IN', 'TRANSFER_OUT')
    group by reference having count(*) <> 2
  ) x;
  if v <> 0 then raise exception '% transfer reference(s) without exactly 2 ledger rows', v; end if;

  -- Demo final balances are exactly the advertised round figures.
  select count(*) into v from public.accounts
  where (id = 'a0000000-0000-4000-8000-000000000001' and balance <> 84250.00)
     or (id = 'a0000000-0000-4000-8000-000000000002' and balance <> 210500.00)
     or (id = 'b0000000-0000-4000-8000-000000000001' and balance <> 118940.00)
     or (id = 'b0000000-0000-4000-8000-000000000002' and balance <> 305000.00)
     or (id = 'c0000000-0000-4000-8000-000000000001' and balance <> 196200.00)
     or (id = 'c0000000-0000-4000-8000-000000000002' and balance <> 450000.00);
  if v <> 0 then raise exception 'Demo target balances do not match the advertised figures'; end if;

  raise notice 'PASS 1: seed shape, ledger integrity, references, target balances';
end $$;

-- 2. Onboarding trigger --------------------------------------------------------

do $$
declare
  v_uid  uuid := '99999999-9999-4999-8999-999999999999';
  v int;
  v_acct text;
begin
  delete from auth.users where id = v_uid;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'onboard@test.local', 'x', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Onboard Test', 'phone', '+91 90000 00000'),
    now(), now(), '', '', '', ''
  );

  select count(*) into v from public.profiles where id = v_uid and full_name = 'Onboard Test';
  if v <> 1 then raise exception 'Trigger did not create profile'; end if;

  select count(*) into v from public.accounts where user_id = v_uid and type = 'CHECKING';
  if v <> 1 then raise exception 'Trigger did not create CHECKING account'; end if;

  select account_number into v_acct from public.accounts where user_id = v_uid;
  if v_acct !~ '^[0-9]{11}$' then raise exception 'Generated account number invalid: %', v_acct; end if;
  if (select count(distinct account_number) from public.accounts) <> (select count(*) from public.accounts) then
    raise exception 'Account numbers are not unique';
  end if;

  select count(*) into v
  from public.cards c join public.accounts a on a.id = c.account_id
  where a.user_id = v_uid and c.status = 'ACTIVE' and c.network = 'VISA' and c.last4 ~ '^[0-9]{4}$';
  if v <> 1 then raise exception 'Trigger did not create an ACTIVE VISA card'; end if;

  select count(*) into v from public.notifications where user_id = v_uid and title = 'Welcome to BankSim';
  if v <> 1 then raise exception 'Trigger did not create the welcome notification'; end if;

  raise notice 'PASS 2: onboarding trigger creates profile + account + card + welcome notification';
end $$;

-- 3. RLS read isolation (as Priya) --------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare v int;
begin
  select count(*) into v from public.accounts;
  if v <> 2 then raise exception 'Priya should see exactly her 2 accounts, saw %', v; end if;

  select count(*) into v from public.accounts where user_id = '11111111-1111-4111-8111-111111111111';
  if v <> 0 then raise exception 'RLS leak: Priya can see Aarav''s accounts'; end if;

  select count(*) into v
  from public.transactions
  where account_id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
  if v <> 0 then raise exception 'RLS leak: Priya can see Aarav''s ledger rows'; end if;

  select count(*) into v from public.transactions where account_id not in (
    select id from public.accounts
  );
  if v <> 0 then raise exception 'RLS leak: Priya can see transactions of foreign accounts'; end if;

  select count(*) into v from public.beneficiaries where user_id <> '22222222-2222-4222-8222-222222222222';
  if v <> 0 then raise exception 'RLS leak: Priya sees foreign beneficiaries'; end if;

  select count(*) into v from public.notifications where user_id <> '22222222-2222-4222-8222-222222222222';
  if v <> 0 then raise exception 'RLS leak: Priya sees foreign notifications'; end if;

  raise notice 'PASS 3: RLS read isolation';
end $$;

-- 4. Privilege enforcement (as Priya) -----------------------------------------

do $$
declare v int := 0; v_ok boolean;
begin
  -- Direct balance writes must be impossible.
  begin
    update public.accounts set balance = balance + 1000
     where id = 'b0000000-0000-4000-8000-000000000001';
    v_ok := true;
  exception when insufficient_privilege then v_ok := false;
  end;
  if v_ok then raise exception 'Direct balance update was allowed'; end if;

  begin
    insert into public.transactions (reference, account_id, direction, txn_type, amount, balance_after)
    values ('TXN-19700101-AAAAAA', 'b0000000-0000-4000-8000-000000000001', 'DEBIT', 'TRANSFER_OUT', 1, 1);
    v_ok := true;
  exception when insufficient_privilege then v_ok := false;
  end;
  if v_ok then raise exception 'Direct ledger insert was allowed'; end if;

  begin
    insert into public.accounts (user_id, type, account_number) values ('22222222-2222-4222-8222-222222222222', 'SAVINGS', '59999999999');
    v_ok := true;
  exception when insufficient_privilege then v_ok := false;
  end;
  if v_ok then raise exception 'Direct account insert was allowed'; end if;

  begin
    insert into public.profiles (id, full_name) values ('22222222-2222-4222-8222-222222222222', 'Priya');
    v_ok := true;
  exception when insufficient_privilege then v_ok := false;
  end;
  if v_ok then raise exception 'Direct profile insert was allowed'; end if;

  begin
    update public.cards set daily_limit = 999999
     where id = 'd0000000-0000-4000-8000-000000000002';
    v_ok := true;
  exception when insufficient_privilege then v_ok := false;
  end;
  if v_ok then raise exception 'Card daily_limit update was allowed'; end if;

  begin
    update public.notifications set title = 'x'
     where user_id = '22222222-2222-4222-8222-222222222222';
    v_ok := true;
  exception when insufficient_privilege then v_ok := false;
  end;
  if v_ok then raise exception 'Notification title update was allowed'; end if;

  begin
    delete from public.transactions where account_id = 'b0000000-0000-4000-8000-000000000001';
    v_ok := true;
  exception when insufficient_privilege then v_ok := false;
  end;
  if v_ok then raise exception 'Ledger delete was allowed'; end if;

  -- Allowed writes: card freeze, notification read flag, profile fields,
  -- beneficiary CRUD.
  update public.cards set status = 'FROZEN' where id = 'd0000000-0000-4000-8000-000000000002';
  update public.cards set status = 'ACTIVE' where id = 'd0000000-0000-4000-8000-000000000002';

  update public.profiles set full_name = 'Priya Nair' where id = '22222222-2222-4222-8222-222222222222';

  update public.notifications set is_read = true
   where user_id = '22222222-2222-4222-8222-222222222222' and is_read = false;
  get diagnostics v = row_count;
  if v <> 2 then raise exception 'Expected 2 unread demo notifications for Priya, marked %', v; end if;

  insert into public.beneficiaries (user_id, name, account_number, ifsc, nickname)
  values ('22222222-2222-4222-8222-222222222222', 'Test Person', '59999999991', 'BSIM0000001', 'temp');
  get diagnostics v = row_count;
  if v <> 1 then raise exception 'Beneficiary insert failed'; end if;

  -- …but not someone else's (RLS with-check).
  begin
    insert into public.beneficiaries (user_id, name, account_number, ifsc)
    values ('11111111-1111-4111-8111-111111111111', 'Sneaky', '59999999992', 'BSIM0000001');
    v_ok := true;
  exception when insufficient_privilege or check_violation then v_ok := false;
  when others then v_ok := false;
  end;
  if v_ok then raise exception 'Cross-user beneficiary insert was allowed'; end if;

  delete from public.beneficiaries
   where user_id = '22222222-2222-4222-8222-222222222222' and account_number = '59999999991';

  raise notice 'PASS 4: privilege enforcement (no direct money writes, column-level grants work)';
end $$;

-- 5. Success paths: transfer atomicity + cash deposit/withdraw ------------------

-- Aarav sends ₹1,500.00 to Rahul; Priya deposits ₹4,321.75 and withdraws ₹1,000.00.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare v_ref text;
begin
  v_ref := public.perform_transfer(
    'a0000000-0000-4000-8000-000000000001', '50300006104', 1500.00, 'Verify-atomicity');
  if v_ref !~ '^TXN-[0-9]{8}-[0-9A-F]{6}$' then raise exception 'Bad reference format: %', v_ref; end if;
  raise notice 'PASS 5a: transfer accepted, ref %', v_ref;
end $$;

set request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare v_ref text;
begin
  v_ref := public.cash_transaction('b0000000-0000-4000-8000-000000000001', 'DEPOSIT', 4321.75, 'Verify-deposit');
  if v_ref !~ '^TXN-[0-9]{8}-[0-9A-F]{6}$' then raise exception 'Bad reference format: %', v_ref; end if;

  v_ref := public.cash_transaction('b0000000-0000-4000-8000-000000000001', 'WITHDRAWAL', 1000.00, 'Verify-withdrawal');
  if v_ref !~ '^TXN-[0-9]{8}-[0-9A-F]{6}$' then raise exception 'Bad reference format: %', v_ref; end if;
  raise notice 'PASS 5b: deposit and withdrawal accepted';
end $$;

reset role;

do $$
declare v int; v_ref text; v_bal numeric(14,2);
begin
  -- Both sides of the transfer moved by exactly 1500.
  select balance into v_bal from public.accounts where id = 'a0000000-0000-4000-8000-000000000001';
  if v_bal <> 82750.00 then raise exception 'Aarav balance expected 82750.00, got %', v_bal; end if;
  select balance into v_bal from public.accounts where id = 'c0000000-0000-4000-8000-000000000001';
  if v_bal <> 197700.00 then raise exception 'Rahul balance expected 197700.00, got %', v_bal; end if;

  -- Two ledger rows, one shared reference, correct types and balance_after.
  select reference into v_ref from public.transactions where memo = 'Verify-atomicity' limit 1;
  select count(*) into v from public.transactions where reference = v_ref;
  if v <> 2 then raise exception 'Expected 2 ledger rows for %, found %', v_ref, v; end if;

  select count(*) into v from public.transactions
  where reference = v_ref
    and (
      (account_id = 'a0000000-0000-4000-8000-000000000001' and direction = 'DEBIT' and txn_type = 'TRANSFER_OUT' and balance_after = 82750.00 and counterparty_account_id = 'c0000000-0000-4000-8000-000000000001')
      or
      (account_id = 'c0000000-0000-4000-8000-000000000001' and direction = 'CREDIT' and txn_type = 'TRANSFER_IN' and balance_after = 197700.00 and counterparty_account_id = 'a0000000-0000-4000-8000-000000000001')
    );
  if v <> 2 then raise exception 'Transfer ledger rows malformed'; end if;

  -- Both users were notified.
  select count(*) into v from public.notifications
  where (user_id = '11111111-1111-4111-8111-111111111111'
         and title = 'Transfer successful' and body like '%1,500.00%' and body like '%82,750.00%')
     or (user_id = '33333333-3333-4333-8333-333333333333'
         and title = 'Money received' and body like '%1,500.00%' and body like '%1,97,700.00%');
  if v <> 2 then raise exception 'Expected transfer notifications for both users, found %', v; end if;

  -- Cash ledger rows and balances.
  select balance into v_bal from public.accounts where id = 'b0000000-0000-4000-8000-000000000001';
  if v_bal <> 122261.75 then raise exception 'Priya balance expected 122261.75, got %', v_bal; end if;

  select count(*) into v from public.transactions where memo = 'Verify-deposit' and direction = 'CREDIT' and txn_type = 'DEPOSIT' and balance_after = 123261.75;
  if v <> 1 then raise exception 'Deposit ledger row malformed'; end if;

  select count(*) into v from public.transactions where memo = 'Verify-withdrawal' and direction = 'DEBIT' and txn_type = 'WITHDRAWAL' and balance_after = 122261.75;
  if v <> 1 then raise exception 'Withdrawal ledger row malformed'; end if;

  select count(*) into v from public.notifications
  where user_id = '22222222-2222-4222-8222-222222222222'
    and (body like '%4,321.75%' or body like '%1,000.00%');
  if v <> 2 then raise exception 'Expected 2 cash notifications for Priya, found %', v; end if;

  raise notice 'PASS 5c: atomic transfer + cash rows verified on both sides (ledger, balances, notifications)';
end $$;

-- 6. Failure paths — clean errors, zero partial state ---------------------------

create temp table t_before as select id, balance from public.accounts;
create temp table t_notif_before as select count(*) as n from public.notifications;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare v_ok boolean; v_msg text;
begin
  -- over limit
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '50300006104', 150000.00, 'FailTest-overlimit');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%maximum transfer amount%' then raise exception 'over-limit: ok=% msg=%', v_ok, v_msg; end if;

  -- 3 decimal places
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '50300006104', 100.123, 'FailTest-scale');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%2 decimal places%' then raise exception 'scale: ok=% msg=%', v_ok, v_msg; end if;

  -- below minimum
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '50300006104', 0.50, 'FailTest-min');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%minimum transfer amount%' then raise exception 'min: ok=% msg=%', v_ok, v_msg; end if;

  -- insufficient funds
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '50300006104', 100000.00, 'FailTest-insufficient');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%Insufficient funds%' then raise exception 'insufficient: ok=% msg=%', v_ok, v_msg; end if;

  -- self transfer
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '50100004291', 100.00, 'FailTest-self');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%same account%' then raise exception 'self: ok=% msg=%', v_ok, v_msg; end if;

  -- unknown destination
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '99999999999', 100.00, 'FailTest-unknown');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%No BankSim account%' then raise exception 'unknown: ok=% msg=%', v_ok, v_msg; end if;

  -- malformed destination
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '12345', 100.00, 'FailTest-badformat');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%11-digit%' then raise exception 'badformat: ok=% msg=%', v_ok, v_msg; end if;

  -- not the owner of the source account
  v_ok := false;
  begin
    perform public.perform_transfer('b0000000-0000-4000-8000-000000000001', '50300006104', 100.00, 'FailTest-notowner');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%your own accounts%' then raise exception 'notowner: ok=% msg=%', v_ok, v_msg; end if;

  -- null amount
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '50300006104', null, 'FailTest-nullamount');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%Enter an amount%' then raise exception 'nullamount: ok=% msg=%', v_ok, v_msg; end if;

  -- invalid cash direction
  v_ok := false;
  begin
    perform public.cash_transaction('a0000000-0000-4000-8000-000000000001', 'TRANSFER', 100.00, 'FailTest-baddirection');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%DEPOSIT or WITHDRAWAL%' then raise exception 'baddirection: ok=% msg=%', v_ok, v_msg; end if;

  -- withdrawal without funds
  v_ok := false;
  begin
    perform public.cash_transaction('a0000000-0000-4000-8000-000000000001', 'WITHDRAWAL', 100000.00, 'FailTest-overdraw');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%Insufficient funds%' then raise exception 'overdraw: ok=% msg=%', v_ok, v_msg; end if;

  raise notice 'PASS 6a: all invalid inputs rejected with clean messages';
end $$;

-- Frozen account: sender side, receiver side, cash, and closed accounts.
reset role;
update public.accounts set status = 'FROZEN' where id in ('a0000000-0000-4000-8000-000000000001');
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare v_ok boolean; v_msg text;
begin
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '50300006104', 100.00, 'FailTest-frozen-sender');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%FROZEN%' then raise exception 'frozen sender: ok=% msg=%', v_ok, v_msg; end if;

  v_ok := false;
  begin
    perform public.cash_transaction('a0000000-0000-4000-8000-000000000001', 'WITHDRAWAL', 100.00, 'FailTest-frozen-cash');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%FROZEN%' then raise exception 'frozen cash: ok=% msg=%', v_ok, v_msg; end if;

  v_ok := false;
  begin
    perform public.cash_transaction('a0000000-0000-4000-8000-000000000001', 'DEPOSIT', 100.00, 'FailTest-frozen-deposit');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%FROZEN%' then raise exception 'frozen deposit: ok=% msg=%', v_ok, v_msg; end if;

  raise notice 'PASS 6b: frozen sender rejected for transfer, deposit and withdrawal';
end $$;

reset role;
update public.accounts set status = 'ACTIVE' where id = 'a0000000-0000-4000-8000-000000000001';
update public.accounts set status = 'FROZEN' where id = 'c0000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare v_ok boolean; v_msg text;
begin
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '50300006104', 100.00, 'FailTest-frozen-receiver');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%recipient account is currently FROZEN%' then raise exception 'frozen receiver: ok=% msg=%', v_ok, v_msg; end if;
  raise notice 'PASS 6c: frozen receiver rejected';
end $$;

reset role;
update public.accounts set status = 'ACTIVE' where id = 'c0000000-0000-4000-8000-000000000001';
update public.accounts set status = 'CLOSED' where id = 'a0000000-0000-4000-8000-000000000002';
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare v_ok boolean; v_msg text;
begin
  v_ok := false;
  begin
    perform public.cash_transaction('a0000000-0000-4000-8000-000000000002', 'DEPOSIT', 100.00, 'FailTest-closed');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%CLOSED%' then raise exception 'closed: ok=% msg=%', v_ok, v_msg; end if;
  raise notice 'PASS 6d: closed account rejected';
end $$;

-- Unauthenticated calls are rejected.
reset role;
set request.jwt.claims = '';
set role authenticated;
do $$
declare v_ok boolean; v_msg text;
begin
  v_ok := false;
  begin
    perform public.perform_transfer('a0000000-0000-4000-8000-000000000001', '50300006104', 100.00, 'FailTest-unauth');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%signed in%' then raise exception 'unauth transfer: ok=% msg=%', v_ok, v_msg; end if;

  v_ok := false;
  begin
    perform public.cash_transaction('a0000000-0000-4000-8000-000000000001', 'DEPOSIT', 100.00, 'FailTest-unauth-cash');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%signed in%' then raise exception 'unauth cash: ok=% msg=%', v_ok, v_msg; end if;

  raise notice 'PASS 6e: unauthenticated money movement rejected';
end $$;

-- anon role cannot read or write any table.
reset role;
set role anon;
set request.jwt.claims = '';
do $$
declare v_ok boolean := false;
begin
  begin
    perform count(*) from public.accounts;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'anon could read accounts'; end if;

  v_ok := false;
  begin
    perform count(*) from public.transactions;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'anon could read transactions'; end if;

  raise notice 'PASS 6f: anon has no table access';
end $$;

-- Zero partial state: every failed operation left balances and bookkeeping untouched.
reset role;
update public.accounts set status = 'ACTIVE' where id = 'a0000000-0000-4000-8000-000000000002';

do $$
declare v int;
begin
  select count(*) into v from public.transactions where memo like 'FailTest%';
  if v <> 0 then raise exception 'Failed operations left % ledger row(s)', v; end if;

  select count(*) into v
  from public.accounts a
  join t_before b on b.id = a.id
  where a.balance <> b.balance;
  if v <> 0 then raise exception 'Failed operations changed % balance(s)', v; end if;

  select count(*) into v from public.notifications;
  if v <> (select n from t_notif_before) then raise exception 'Failed operations created notifications'; end if;

  raise notice 'PASS 6g: zero partial state after all rejected operations';
end $$;

-- 7. Ledger immutability: (reference, account_id) uniqueness -------------------

do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.transactions (reference, account_id, direction, txn_type, amount, balance_after)
    values (
      (select reference from public.transactions where memo = 'Verify-atomicity' limit 1),
      'a0000000-0000-4000-8000-000000000001', 'DEBIT', 'TRANSFER_OUT', 1.00, 1.00
    );
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'Duplicate (reference, account_id) was accepted'; end if;
  raise notice 'PASS 7: (reference, account_id) uniqueness enforced';
end $$;

do $$ begin raise notice 'ALL CHECKS PASSED'; end $$;
