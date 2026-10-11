-- BankSim — local test harness
--
-- Minimal stand-ins for the pieces of a hosted Supabase project that our
-- migrations/seed depend on: the `auth` schema (users, identities, uid()),
-- the `anon` / `authenticated` roles, and pgcrypto availability.
--
-- Only needed for running the SQL suite against a plain local Postgres —
-- a real Supabase project has all of this already.

create schema if not exists auth;
create schema if not exists extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit;
  end if;
end $$;

create table if not exists auth.users (
  instance_id              uuid,
  id                       uuid primary key,
  aud                      varchar(255),
  role                     varchar(255),
  email                    varchar(255) unique,
  encrypted_password       varchar(255),
  email_confirmed_at       timestamptz,
  invited_at               timestamptz,
  confirmation_token       varchar(255),
  confirmation_sent_at     timestamptz,
  recovery_token           varchar(255),
  recovery_sent_at         timestamptz,
  email_change_token_new   varchar(255),
  email_change             varchar(255),
  email_change_sent_at     timestamptz,
  last_sign_in_at          timestamptz,
  raw_app_meta_data        jsonb,
  raw_user_meta_data       jsonb,
  is_super_admin           boolean,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

create table if not exists auth.identities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  provider_id      text not null,
  identity_data    jsonb,
  provider         text not null,
  last_sign_in_at  timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (provider_id, provider)
);

-- Supabase's auth.uid(): the `sub` claim of the current request's JWT.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

grant usage on schema auth to public;
grant execute on function auth.uid() to public;
