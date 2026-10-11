-- BankSim — SQL verification suite for the conversational assistant (migration 04)
--
-- Run with psql after harness + migrations 01–04 + seed (see verify.sql header
-- for the full sequence), then:
--
--   psql -d banksim_test -v ON_ERROR_STOP=1 -f supabase/tests/verify_chat.sql
--
-- Covers: conversations / chat_messages RLS isolation, confirmation_tokens
-- lockdown (no direct grants), and the single-use + TTL + user-bound semantics
-- of the confirmation-token RPCs. Any failed assertion raises; PASS notices
-- mark completed checks.

\set ON_ERROR_STOP on

-- 1. Conversations + chat messages: RLS isolation ------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_conv uuid;
  v_msg  uuid;
begin
  insert into public.conversations (user_id, title)
  values ('11111111-1111-4111-8111-111111111111', 'Aarav test conversation')
  returning id into v_conv;

  insert into public.chat_messages (id, conversation_id, role, parts)
  values (gen_random_uuid(), v_conv, 'user', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'what is my balance?')))
  returning id into v_msg;

  -- The owner sees their own rows.
  if (select count(*) from public.conversations where id = v_conv) <> 1 then
    raise exception 'Owner cannot read back their own conversation';
  end if;
  if (select count(*) from public.chat_messages where conversation_id = v_conv) <> 1 then
    raise exception 'Owner cannot read back their own message';
  end if;

  -- Can insert a second message and rename the conversation.
  insert into public.chat_messages (conversation_id, role, parts)
  values (v_conv, 'assistant', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'ok')));

  update public.conversations set title = 'Renamed', updated_at = now() where id = v_conv;

  raise notice 'PASS C1: owner can create/read/rename their conversation + messages';
end $$;

set request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare
  v_conv uuid;
  v_ok   boolean;
  v_n    int;
begin
  -- The other user sees none of Aarav's conversations or messages…
  select count(*) into v_n
    from public.conversations
   where user_id = '11111111-1111-4111-8111-111111111111';
  if v_n <> 0 then raise exception 'RLS leak: Priya can see Aarav''s conversations'; end if;

  select count(*) into v_n
    from public.chat_messages m
    join public.conversations c on c.id = m.conversation_id
   where c.user_id = '11111111-1111-4111-8111-111111111111';
  if v_n <> 0 then raise exception 'RLS leak: Priya can see Aarav''s chat messages'; end if;

  -- …cannot reply inside Aarav's conversation…
  v_ok := false;
  begin
    insert into public.chat_messages (conversation_id, role, parts)
    values (
      (select id from public.conversations where user_id = '11111111-1111-4111-8111-111111111111' limit 1),
      'user', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'sneak'))
    );
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then raise exception 'Cross-user chat_messages insert was allowed'; end if;

  -- …cannot rename it…
  update public.conversations set title = 'hijacked'
   where user_id = '11111111-1111-4111-8111-111111111111';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'Cross-user conversation update affected rows'; end if;

  raise notice 'PASS C2: RLS isolation for conversations and chat messages';
end $$;

-- 2. confirmation_tokens lockdown ---------------------------------------------

-- Direct access to the token table must be impossible for both anon and
-- authenticated — even selecting, let alone updating used_at.

set role anon;
set request.jwt.claims = '';
do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    perform count(*) from public.confirmation_tokens;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'anon could read confirmation_tokens'; end if;

  v_ok := false;
  begin
    perform count(*) from public.conversations;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'anon could read conversations'; end if;
  raise notice 'PASS C3: anon has no access to chat tables';
end $$;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    perform count(*) from public.confirmation_tokens;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'authenticated could read confirmation_tokens directly'; end if;

  v_ok := false;
  begin
    update public.confirmation_tokens set used_at = null;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'authenticated could update confirmation_tokens directly'; end if;

  raise notice 'PASS C4: confirmation_tokens has no direct client access (RPC-only)';
end $$;

-- 3. Token lifecycle: issue → redeem (single-use), TTL, user binding ----------

set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_res        jsonb;
  v_tok        uuid;
  v_expires    timestamptz;
  v_served     jsonb;
  v_ok         boolean;
  v_msg        text;
begin
  -- 3a. Issue: object params + ~5 minute TTL.
  v_res := public.issue_confirmation_token(
    'transfer_money',
    jsonb_build_object('from_account_id', 'a0000000-0000-4000-8000-000000000002',
                       'to_account_number', '50300006104', 'amount', 500, 'memo', 'token test'),
    null
  );
  v_tok := (v_res ->> 'token')::uuid;
  v_expires := (v_res ->> 'expires_at')::timestamptz;
  if v_tok is null then raise exception 'issue_confirmation_token returned no token'; end if;
  if v_expires < now() + interval '4 minutes' or v_expires > now() + interval '6 minutes' then
    raise exception 'Token TTL is not ~5 minutes: %', v_expires;
  end if;

  -- 3b. Redeem: returns the exact params, marks used.
  v_served := public.redeem_confirmation_token(v_tok);
  if (v_served ->> 'tool_name') <> 'transfer_money' then
    raise exception 'Redeemed tool_name mismatch: %', v_served;
  end if;
  if (v_served -> 'params' ->> 'memo') <> 'token test'
     or (v_served -> 'params' ->> 'amount')::numeric <> 500 then
    raise exception 'Redeemed params mismatch: %', v_served;
  end if;

  -- 3c. Reuse is rejected.
  v_ok := false;
  begin
    perform public.redeem_confirmation_token(v_tok);
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%already been used%' then
    raise exception 'Token reuse: ok=% msg=%', v_ok, v_msg;
  end if;

  raise notice 'PASS C5: token issue + redeem + single-use enforcement';
end $$;

-- 3d. Expiry: backdate a fresh token (as superuser to time-travel), then redeem.
do $$
declare
  v_tok uuid;
begin
  select (public.issue_confirmation_token(
    'transfer_money',
    jsonb_build_object('from_account_id', 'a0000000-0000-4000-8000-000000000002',
                       'to_account_number', '50300006104', 'amount', 1, 'memo', 'expire test'),
    null
  ) ->> 'token')::uuid into v_tok;

  create temp table t_expire_token as select v_tok as id;
end $$;

reset role;

update public.confirmation_tokens
   set expires_at = now() - interval '1 second'
 where id = (select id from t_expire_token);

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare v_ok boolean; v_msg text;
begin
  v_ok := false;
  begin
    perform public.redeem_confirmation_token((select id from t_expire_token));
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%expired%' then
    raise exception 'Token expiry: ok=% msg=%', v_ok, v_msg;
  end if;

  drop table t_expire_token;

  raise notice 'PASS C6: expired tokens rejected';
end $$;

-- 3e. User binding: Priya cannot redeem Aarav's token.
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare v_tok uuid;
begin
  select (public.issue_confirmation_token(
    'withdraw_cash',
    jsonb_build_object('account_id', 'a0000000-0000-4000-8000-000000000002',
                       'amount', 25, 'memo', 'user binding test'),
    null
  ) ->> 'token')::uuid into v_tok;

  create temp table t_stolen_token as select v_tok as id;
end $$;

set request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare v_ok boolean; v_msg text;
begin
  v_ok := false;
  begin
    perform public.redeem_confirmation_token((select id from t_stolen_token));
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%no longer valid%' then
    raise exception 'Cross-user redeem: ok=% msg=%', v_ok, v_msg;
  end if;

  -- A failed cross-user attempt must NOT have consumed the token: the owner
  -- can still redeem it.
  raise notice 'PASS C7: tokens are user-bound (cross-user redeem rejected)';
end $$;

set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare v_served jsonb;
begin
  v_served := public.redeem_confirmation_token((select id from t_stolen_token));
  if (v_served ->> 'tool_name') <> 'withdraw_cash' then
    raise exception 'Owner could not redeem after a cross-user attempt: %', v_served;
  end if;
  drop table t_stolen_token;
end $$;

-- 3f. Input guards: unknown tool, non-object params, foreign conversation.
do $$
declare v_ok boolean; v_msg text;
begin
  v_ok := false;
  begin
    perform public.issue_confirmation_token('delete_everything', '{}'::jsonb, null);
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%does not support confirmations%' then
    raise exception 'unknown tool: ok=% msg=%', v_ok, v_msg;
  end if;

  v_ok := false;
  begin
    perform public.issue_confirmation_token('transfer_money', '"not an object"'::jsonb, null);
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%JSON object%' then
    raise exception 'non-object params: ok=% msg=%', v_ok, v_msg;
  end if;

  v_ok := false;
  begin
    perform public.issue_confirmation_token('transfer_money', '{}'::jsonb, gen_random_uuid());
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%Conversation not found%' then
    raise exception 'foreign conversation: ok=% msg=%', v_ok, v_msg;
  end if;

  raise notice 'PASS C8: token RPC input guards';
end $$;

-- 3g. Unauthenticated calls are rejected.
set request.jwt.claims = '';
do $$
declare v_ok boolean; v_msg text;
begin
  v_ok := false;
  begin
    perform public.issue_confirmation_token('transfer_money', '{}'::jsonb, null);
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%signed in%' then
    raise exception 'unauth issue: ok=% msg=%', v_ok, v_msg;
  end if;

  v_ok := false;
  begin
    perform public.redeem_confirmation_token(gen_random_uuid());
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok or v_msg not like '%signed in%' then
    raise exception 'unauth redeem: ok=% msg=%', v_ok, v_msg;
  end if;

  raise notice 'PASS C9: unauthenticated token RPC calls rejected';
end $$;

-- 4. Cleanup + cascade sanity --------------------------------------------------

reset role;

do $$
declare v_conv uuid; v_n int;
begin
  select id into v_conv from public.conversations where title = 'Renamed';
  if v_conv is null then raise exception 'Expected the renamed test conversation'; end if;

  select count(*) into v_n from public.chat_messages where conversation_id = v_conv;
  if v_n <> 2 then raise exception 'Expected 2 messages before cascade, found %', v_n; end if;

  delete from public.conversations where id = v_conv;

  select count(*) into v_n from public.chat_messages where conversation_id = v_conv;
  if v_n <> 0 then raise exception 'Messages did not cascade on conversation delete'; end if;

  raise notice 'PASS C10: deleting a conversation cascades to its messages';
end $$;

do $$ begin raise notice 'ALL CHAT CHECKS PASSED'; end $$;
