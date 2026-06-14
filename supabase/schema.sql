-- Contract Scanner — Complete Database Schema
-- Run this entire file in Supabase SQL Editor
-- SQL Editor -> New Query -> Paste -> Run

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Users table ──────────────────────────────────────────────────────────
-- Extends Supabase auth.users with app-specific fields
create table if not exists public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  stripe_customer_id text,
  tier text default 'free',
  scans_used integer default 0,
  jurisdiction text default 'IN',
  created_at timestamptz default now()
);

-- ── Contracts table ───────────────────────────────────────────────────────
create table if not exists public.contracts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade,
  file_url text not null,
  title text not null,
  status text default 'pending'
    check (status in ('pending', 'scanning', 'complete', 'error')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Scans table ───────────────────────────────────────────────────────────
create table if not exists public.scans (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid references public.contracts(id) on delete cascade,
  risk_json jsonb,
  risk_score integer default 0,
  summary text default '',
  model_used text,
  tokens_used integer default 0,
  external_refs text[] default '{}',
  scanned_at timestamptz default now()
);

-- ── Auto-create user row on signup ────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.contracts enable row level security;
alter table public.scans enable row level security;

-- Users: own record only
drop policy if exists "Users can view own record" on public.users;
create policy "Users can view own record"
  on public.users for select
  using (auth.uid() = id);

drop policy if exists "Users can update own record" on public.users;
create policy "Users can update own record"
  on public.users for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own record" on public.users;
create policy "Users can insert own record"
  on public.users for insert
  with check (auth.uid() = id);

-- Contracts: own contracts only
drop policy if exists "Users can view own contracts" on public.contracts;
create policy "Users can view own contracts"
  on public.contracts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own contracts" on public.contracts;
create policy "Users can insert own contracts"
  on public.contracts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own contracts" on public.contracts;
create policy "Users can update own contracts"
  on public.contracts for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own contracts" on public.contracts;
create policy "Users can delete own contracts"
  on public.contracts for delete
  using (auth.uid() = user_id);

-- Scans: accessible via contract ownership
drop policy if exists "Users can view scans for own contracts" on public.scans;
create policy "Users can view scans for own contracts"
  on public.scans for select
  using (
    exists (
      select 1 from public.contracts
      where contracts.id = scans.contract_id
      and contracts.user_id = auth.uid()
    )
  );

-- ── Storage bucket policies ───────────────────────────────────────────────
-- Run these AFTER creating a private bucket called "contracts" in Storage

drop policy if exists "Users can upload own contracts" on storage.objects;
create policy "Users can upload own contracts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'contracts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read own contracts" on storage.objects;
create policy "Users can read own contracts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'contracts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own contracts" on storage.objects;
create policy "Users can delete own contracts"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'contracts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Service role full access" on storage.objects;
create policy "Service role full access"
  on storage.objects
  to service_role
  using (true)
  with check (true);
