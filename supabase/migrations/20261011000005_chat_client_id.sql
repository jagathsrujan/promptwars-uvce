-- BankSim — 05. Chat message client ids.
--
-- The client (useChat) generates an id for every user message it sends. Storing
-- it lets a Retry of the same message (regenerate) upsert instead of inserting a
-- duplicate row — the model history then contains the user's message exactly
-- once per send, even after failed generations are retried.

alter table public.chat_messages add column if not exists client_id text;

create unique index if not exists chat_messages_client_id_unique
  on public.chat_messages (conversation_id, client_id)
  where client_id is not null;
