create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z.]{1,12}$'),
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table if not exists public.signal_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z.]{1,12}$'),
  entry_price numeric not null check (entry_price > 0),
  quantity numeric not null check (quantity > 0),
  currency text not null default 'USD',
  thesis text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists signal_journal_user_recorded on public.signal_journal(user_id, recorded_at desc);

alter table public.watchlist_items enable row level security;
alter table public.signal_journal enable row level security;
create policy "watchlist owner select" on public.watchlist_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "watchlist owner insert" on public.watchlist_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "watchlist owner delete" on public.watchlist_items for delete to authenticated using ((select auth.uid()) = user_id);
create policy "journal owner select" on public.signal_journal for select to authenticated using ((select auth.uid()) = user_id);
create policy "journal owner insert" on public.signal_journal for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "journal owner update" on public.signal_journal for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "journal owner delete" on public.signal_journal for delete to authenticated using ((select auth.uid()) = user_id);
