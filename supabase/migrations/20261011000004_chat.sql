-- BankSim — 04. Conversational assistant: conversations, chat messages and
-- single-use confirmation tokens.
--
-- Phase 2 (tool-access layer) works like the rest of BankSim: clients never
-- touch anything directly that matters.
--   * conversations + chat_messages are per-user, RLS-protected data with only
--     the grants the app needs (no deletes; history is immutable apart from the
--     assistant patching its own tool-card state).
--   * confirmation_tokens has NO grants for authenticated at all. Tokens are
--     issued and redeemed exclusively through the SECURITY DEFINER RPCs below,
--     so "single-use, 5-minute TTL, bound to the exact params and to the user"
--     is enforced by the database — a modified client cannot bypass it, and
--     "yes" typed in chat can never execute anything.

-- conversations ---------------------------------------------------------------

create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'New conversation' check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

-- chat_messages ---------------------------------------------------------------
-- One row per message. `parts` is the AI SDK UIMessage parts array (text parts,
-- tool-call parts with their structured results, …) — the exact shape the UI
-- needs to re-render a conversation, persisted as jsonb.

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  parts           jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  created_at      timestamptz not null default now()
);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at, id);

-- confirmation_tokens ---------------------------------------------------------
-- Issued when the assistant proposes a money/account change; redeemed only when
-- the user taps Confirm in the UI. The params snapshot is the single source of
-- truth for execution — whatever the model said in chat cannot alter it.

create table if not exists public.confirmation_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  tool_name       text not null,
  params          jsonb not null check (jsonb_typeof(params) = 'object'),
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  used_at         timestamptz
);

create index if not exists confirmation_tokens_user_created_idx
  on public.confirmation_tokens (user_id, created_at desc);

-- Row Level Security + grants -------------------------------------------------

alter table public.conversations       enable row level security;
alter table public.chat_messages       enable row level security;
alter table public.confirmation_tokens enable row level security;

revoke all on table public.conversations       from anon, authenticated;
revoke all on table public.chat_messages       from anon, authenticated;
revoke all on table public.confirmation_tokens from anon, authenticated;

-- The app may start conversations and rename them; `updated_at` is bumped when
-- a message is appended so "most recent conversation" ordering is real.
grant select, insert on table public.conversations to authenticated;
grant update (title, updated_at) on table public.conversations to authenticated;

-- Messages are read back for resume; the assistant message's `parts` are
-- patched when a confirmation card is confirmed/cancelled/expired.
grant select, insert on table public.chat_messages to authenticated;
grant update (parts) on table public.chat_messages to authenticated;

-- confirmation_tokens: intentionally no grants. RPCs only.

drop policy if exists "conversations_select_own" on public.conversations;
create policy "conversations_select_own"
  on public.conversations for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "conversations_insert_own" on public.conversations;
create policy "conversations_insert_own"
  on public.conversations for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "conversations_update_own" on public.conversations;
create policy "conversations_update_own"
  on public.conversations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own"
  on public.chat_messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own"
  on public.chat_messages for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own"
  on public.chat_messages for update to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

-- Confirmation token RPCs ------------------------------------------------------

-- issue_confirmation_token: called by the server chokepoint (executeTool) when
-- the assistant proposes a money/account change. Returns the opaque token id and
-- its expiry (5 minutes).
create or replace function public.issue_confirmation_token(
  p_tool_name text,
  p_params jsonb,
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz := now() + interval '5 minutes';
  v_id      uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_tool_name not in ('transfer_money', 'deposit_cash', 'withdraw_cash', 'add_beneficiary', 'set_card_status') then
    raise exception 'This tool does not support confirmations.';
  end if;

  if p_params is null or jsonb_typeof(p_params) <> 'object' then
    raise exception 'Confirmation parameters must be a JSON object.';
  end if;

  if pg_column_size(p_params) > 8192 then
    raise exception 'Confirmation parameters are too large.';
  end if;

  if p_conversation_id is not null and not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.user_id = auth.uid()
  ) then
    raise exception 'Conversation not found.';
  end if;

  insert into public.confirmation_tokens (user_id, tool_name, params, conversation_id, expires_at)
  values (auth.uid(), p_tool_name, p_params, p_conversation_id, v_expires)
  returning id into v_id;

  return jsonb_build_object('token', v_id, 'expires_at', v_expires);
end;
$$;

-- redeem_confirmation_token: called by the confirm endpoint when the user taps
-- Confirm/Cancel. Locks the row, checks user + TTL + single-use, marks it used
-- and returns the exact params that were proposed. The only way params can
-- reach execution is through a redeemed token.
create or replace function public.redeem_confirmation_token(p_token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.confirmation_tokens;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_token
    from public.confirmation_tokens
   where id = p_token_id
     for update;

  if not found or v_token.user_id <> auth.uid() then
    raise exception 'This confirmation is no longer valid. Please ask the assistant again.';
  end if;

  if v_token.used_at is not null then
    raise exception 'This confirmation has already been used.';
  end if;

  if v_token.expires_at <= now() then
    raise exception 'This confirmation has expired. Please ask the assistant again.';
  end if;

  update public.confirmation_tokens set used_at = now() where id = p_token_id;

  return jsonb_build_object(
    'tool_name', v_token.tool_name,
    'params', v_token.params,
    'conversation_id', v_token.conversation_id
  );
end;
$$;

revoke all on function public.issue_confirmation_token(text, jsonb, uuid) from public;
grant execute on function public.issue_confirmation_token(text, jsonb, uuid) to authenticated;

revoke all on function public.redeem_confirmation_token(uuid) from public;
grant execute on function public.redeem_confirmation_token(uuid) to authenticated;
