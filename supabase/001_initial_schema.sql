-- ─────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- 2. TABLES
-- ─────────────────────────────────────────────

create table public.users (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null unique,
  stripe_customer_id text,
  tier               text not null default 'free' check (tier in ('free', 'pro')),
  scans_used         integer not null default 0,
  created_at         timestamptz not null default now()
);

create table public.contracts (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.users(id) on delete cascade,
  file_url   text not null,
  title      text not null,
  status     text not null default 'pending' check (status in ('pending', 'complete', 'error')),
  created_at timestamptz not null default now()
);

create table public.scans (
  id           uuid primary key default uuid_generate_v4(),
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  risk_json    jsonb,
  model_used   text,
  tokens_used  integer,
  scanned_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 3. INDEXES
-- ─────────────────────────────────────────────
create index contracts_user_id_idx on public.contracts(user_id);
create index scans_contract_id_idx on public.scans(contract_id);

-- ─────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
alter table public.users    enable row level security;
alter table public.contracts enable row level security;
alter table public.scans    enable row level security;

-- users: can only read/update their own row
create policy "users: select own"  on public.users for select using (auth.uid() = id);
create policy "users: update own"  on public.users for update using (auth.uid() = id);

-- contracts: full CRUD on own rows only
create policy "contracts: select own" on public.contracts for select using (auth.uid() = user_id);
create policy "contracts: insert own" on public.contracts for insert with check (auth.uid() = user_id);
create policy "contracts: update own" on public.contracts for update using (auth.uid() = user_id);
create policy "contracts: delete own" on public.contracts for delete using (auth.uid() = user_id);

-- scans: readable if the parent contract belongs to the user
create policy "scans: select own" on public.scans for select
  using (
    exists (
      select 1 from public.contracts c
      where c.id = scans.contract_id and c.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 5. AUTO-CREATE USER ROW ON SIGNUP
-- ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- 6. STORAGE BUCKET
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false);

-- Users can upload to their own folder: contracts/<user_id>/*
create policy "storage: upload own" on storage.objects for insert
  with check (
    bucket_id = 'contracts' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can read their own files
create policy "storage: read own" on storage.objects for select
  using (
    bucket_id = 'contracts' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own files
create policy "storage: delete own" on storage.objects for delete
  using (
    bucket_id = 'contracts' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
