create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  input_text text not null,
  output_json jsonb,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);

alter table public.runs enable row level security;

drop policy if exists runs_open_all on public.runs;

create policy runs_open_all on public.runs
  for all
  using (true)
  with check (true);
