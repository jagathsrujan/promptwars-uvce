-- BankSim — 03. Functions: account-number generation, references, onboarding trigger,
-- and the atomic money-movement RPCs.
--
-- Design rules enforced here (the server is the authority):
--   * All money lives in numeric(14,2); no float arithmetic anywhere.
--   * Clients can only move money through these SECURITY DEFINER functions.
--   * Every validation failure raises a human-readable exception and rolls the
--     whole transaction back — a failed transfer leaves zero partial state.
--   * Both accounts involved in a transfer are locked in a deterministic
--     (ascending id) order, so concurrent opposite transfers cannot deadlock.

-- Helpers -------------------------------------------------------------------

-- Unique 11-digit account number, e.g. 50123456789. SECURITY DEFINER because it
-- must see *all* accounts to guarantee uniqueness (RLS would hide other users').
create or replace function public.generate_account_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
  v_taken  boolean;
begin
  loop
    v_number := '5' || lpad((floor(random() * 1000000000))::bigint::text, 10, '0');
    select exists (select 1 from public.accounts where account_number = v_number)
      into v_taken;
    exit when not v_taken;
  end loop;
  return v_number;
end;
$$;

-- Reference format: TXN-YYYYMMDD-XXXXXX (date in IST, 6 uppercase hex chars).
create or replace function public.generate_reference()
returns text
language sql
volatile
as $$
  select 'TXN-'
    || to_char((now() at time zone 'Asia/Kolkata'), 'YYYYMMDD')
    || '-'
    || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

-- INR text formatting honouring lakh/crore grouping: 84250.5 -> 84,250.50
create or replace function public.format_inr(p_amount numeric)
returns text
language sql
immutable
as $$
  select to_char(p_amount, 'FM99,99,99,999.00');
$$;

-- Onboarding trigger ---------------------------------------------------------
-- When a new auth user is created: profile + one CHECKING account (unique
-- 11-digit number) + one ACTIVE VISA card + a welcome notification.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name      text;
  v_phone          text;
  v_holder         text;
  v_account_id     uuid;
  v_account_number text;
begin
  v_full_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_phone     := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  v_holder    := left(upper(coalesce(v_full_name, 'BANKSIM CUSTOMER')), 24);

  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(v_full_name, ''), v_phone)
  on conflict (id) do nothing;

  v_account_number := public.generate_account_number();

  insert into public.accounts (user_id, type, account_number)
  values (new.id, 'CHECKING', v_account_number)
  returning id into v_account_id;

  insert into public.cards (account_id, last4, holder_name, expiry_month, expiry_year)
  values (
    v_account_id,
    lpad((floor(random() * 10000))::int::text, 4, '0'),
    v_holder,
    extract(month from (now() + interval '3 years'))::smallint,
    extract(year from (now() + interval '3 years'))::smallint
  );

  insert into public.notifications (user_id, title, body)
  values (
    new.id,
    'Welcome to BankSim',
    'Your accounts are ready. Explore your dashboard, add beneficiaries, and make your first transfer.'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Money movement -------------------------------------------------------------

-- perform_transfer: atomically move money between two accounts.
-- Checks: caller owns the source account, both accounts ACTIVE, destination
-- exists, amount in [1, 100000] with max 2 decimals, not a self-transfer,
-- sufficient funds. Produces two ledger rows sharing one reference and a
-- notification for each user. Returns the reference on success.
create or replace function public.perform_transfer(
  from_account_id uuid,
  to_account_number text,
  amount numeric,
  memo text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender           public.accounts;
  v_receiver         public.accounts;
  v_amount           numeric(14,2);
  v_memo             text;
  v_reference        text;
  v_sender_balance   numeric(14,2);
  v_receiver_balance numeric(14,2);
  v_sender_name      text;
  v_receiver_name    text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to transfer money.';
  end if;

  -- Amount: 1.00 – 1,00,000.00, at most 2 decimal places.
  if amount is null then
    raise exception 'Enter an amount to transfer.';
  end if;
  if amount < 1 then
    raise exception 'The minimum transfer amount is ₹1.00.';
  end if;
  if amount > 100000 then
    raise exception 'The maximum transfer amount is ₹1,00,000.00 per transaction.';
  end if;
  if round(amount, 2) <> amount then
    raise exception 'Amounts can have at most 2 decimal places.';
  end if;
  v_amount := round(amount, 2);

  v_memo := nullif(left(trim(coalesce(memo, '')), 140), '');

  if to_account_number is null or trim(to_account_number) !~ '^[0-9]{11}$' then
    raise exception 'Enter a valid 11-digit account number.';
  end if;

  -- Identify both accounts, then validate everything while holding row locks.
  select * into v_sender from public.accounts where id = from_account_id;
  if not found then
    raise exception 'The account you are sending from was not found.';
  end if;
  if v_sender.user_id <> auth.uid() then
    raise exception 'You can only transfer money from your own accounts.';
  end if;

  select * into v_receiver from public.accounts where account_number = trim(to_account_number);
  if not found then
    raise exception 'No BankSim account was found with account number %.', trim(to_account_number);
  end if;
  if v_receiver.id = v_sender.id then
    raise exception 'You cannot transfer money to the same account.';
  end if;

  -- Deterministic lock order (ascending account id) prevents deadlocks between
  -- concurrent transfers in opposite directions.
  perform 1
  from public.accounts
  where id in (v_sender.id, v_receiver.id)
  order by id
  for update;

  select * into v_sender   from public.accounts where id = v_sender.id;
  select * into v_receiver from public.accounts where id = v_receiver.id;

  if v_sender.status <> 'ACTIVE' then
    raise exception 'Your account is % — money movement is blocked. Contact BankSim support to reactivate it.', v_sender.status;
  end if;
  if v_receiver.status <> 'ACTIVE' then
    raise exception 'The recipient account is currently % and cannot receive money.', v_receiver.status;
  end if;

  if v_sender.balance < v_amount then
    raise exception 'Insufficient funds. Your available balance is ₹%.', public.format_inr(v_sender.balance);
  end if;

  v_reference := public.generate_reference();

  update public.accounts
     set balance = balance - v_amount
   where id = v_sender.id
  returning balance into v_sender_balance;

  update public.accounts
     set balance = balance + v_amount
   where id = v_receiver.id
  returning balance into v_receiver_balance;

  -- Two ledger rows, one shared reference.
  insert into public.transactions
    (reference, account_id, counterparty_account_id, direction, txn_type, amount, balance_after, memo, status)
  values
    (v_reference, v_sender.id,   v_receiver.id, 'DEBIT',  'TRANSFER_OUT', v_amount, v_sender_balance,   v_memo, 'COMPLETED'),
    (v_reference, v_receiver.id, v_sender.id,   'CREDIT', 'TRANSFER_IN',  v_amount, v_receiver_balance, v_memo, 'COMPLETED');

  select full_name into v_sender_name   from public.profiles where id = v_sender.user_id;
  select full_name into v_receiver_name from public.profiles where id = v_receiver.user_id;
  v_sender_name   := coalesce(nullif(trim(coalesce(v_sender_name, '')), ''), 'a BankSim customer');
  v_receiver_name := coalesce(nullif(trim(coalesce(v_receiver_name, '')), ''), 'a BankSim customer');

  insert into public.notifications (user_id, title, body)
  values
    (v_sender.user_id,
     'Transfer successful',
     'You sent ₹' || public.format_inr(v_amount) || ' to ' || v_receiver_name
       || ' (••••' || right(v_receiver.account_number, 4) || '). Ref ' || v_reference
       || coalesce(' · ' || v_memo, '')
       || '. New balance: ₹' || public.format_inr(v_sender_balance) || '.'),
    (v_receiver.user_id,
     'Money received',
     'You received ₹' || public.format_inr(v_amount) || ' from ' || v_sender_name
       || ' (••••' || right(v_sender.account_number, 4) || ') into ••••' || right(v_receiver.account_number, 4)
       || '. Ref ' || v_reference
       || coalesce(' · ' || v_memo, '')
       || '. New balance: ₹' || public.format_inr(v_receiver_balance) || '.');

  return v_reference;
end;
$$;

-- cash_transaction: deposit into or withdraw from one of the caller's accounts.
-- Same ownership/status checks; withdrawals require sufficient funds. Writes
-- one ledger row and one notification. Returns the reference on success.
create or replace function public.cash_transaction(
  account_id uuid,
  direction text,
  amount numeric,
  memo text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account   public.accounts;
  v_direction text;
  v_amount    numeric(14,2);
  v_memo      text;
  v_reference text;
  v_balance   numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to move money.';
  end if;

  v_direction := upper(trim(coalesce(direction, '')));
  if v_direction not in ('DEPOSIT', 'WITHDRAWAL') then
    raise exception 'Direction must be DEPOSIT or WITHDRAWAL.';
  end if;

  if amount is null then
    raise exception 'Enter an amount.';
  end if;
  if amount < 1 then
    raise exception 'The minimum amount is ₹1.00.';
  end if;
  if amount > 100000 then
    raise exception 'The maximum amount per transaction is ₹1,00,000.00.';
  end if;
  if round(amount, 2) <> amount then
    raise exception 'Amounts can have at most 2 decimal places.';
  end if;
  v_amount := round(amount, 2);

  v_memo := nullif(left(trim(coalesce(memo, '')), 140), '');

  select * into v_account from public.accounts where id = account_id for update;
  if not found then
    raise exception 'Account not found.';
  end if;
  if v_account.user_id <> auth.uid() then
    raise exception 'You can only move money in your own accounts.';
  end if;
  if v_account.status <> 'ACTIVE' then
    raise exception 'This account is % — money movement is blocked. Contact BankSim support to reactivate it.', v_account.status;
  end if;

  if v_direction = 'WITHDRAWAL' and v_account.balance < v_amount then
    raise exception 'Insufficient funds. Your available balance is ₹%.', public.format_inr(v_account.balance);
  end if;

  v_reference := public.generate_reference();

  if v_direction = 'DEPOSIT' then
    update public.accounts
       set balance = balance + v_amount
     where id = v_account.id
    returning balance into v_balance;

    insert into public.transactions
      (reference, account_id, counterparty_account_id, direction, txn_type, amount, balance_after, memo, status)
    values
      (v_reference, v_account.id, null, 'CREDIT', 'DEPOSIT', v_amount, v_balance, v_memo, 'COMPLETED');

    insert into public.notifications (user_id, title, body)
    values (
      v_account.user_id,
      'Deposit successful',
      '₹' || public.format_inr(v_amount) || ' was deposited into ••••' || right(v_account.account_number, 4)
        || '. Ref ' || v_reference || coalesce(' · ' || v_memo, '')
        || '. New balance: ₹' || public.format_inr(v_balance) || '.'
    );
  else
    update public.accounts
       set balance = balance - v_amount
     where id = v_account.id
    returning balance into v_balance;

    insert into public.transactions
      (reference, account_id, counterparty_account_id, direction, txn_type, amount, balance_after, memo, status)
    values
      (v_reference, v_account.id, null, 'DEBIT', 'WITHDRAWAL', v_amount, v_balance, v_memo, 'COMPLETED');

    insert into public.notifications (user_id, title, body)
    values (
      v_account.user_id,
      'Withdrawal successful',
      '₹' || public.format_inr(v_amount) || ' was withdrawn from ••••' || right(v_account.account_number, 4)
        || '. Ref ' || v_reference || coalesce(' · ' || v_memo, '')
        || '. New balance: ₹' || public.format_inr(v_balance) || '.'
    );
  end if;

  return v_reference;
end;
$$;

-- Function privileges --------------------------------------------------------
-- Nothing here is callable by anon. The RPCs are callable by signed-in users;
-- the helpers and the trigger function are internal only.

revoke all on function public.perform_transfer(uuid, text, numeric, text) from public;
grant execute on function public.perform_transfer(uuid, text, numeric, text) to authenticated;

revoke all on function public.cash_transaction(uuid, text, numeric, text) from public;
grant execute on function public.cash_transaction(uuid, text, numeric, text) to authenticated;

revoke all on function public.generate_account_number() from public, anon, authenticated;
revoke all on function public.generate_reference() from public, anon, authenticated;
revoke all on function public.format_inr(numeric) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
