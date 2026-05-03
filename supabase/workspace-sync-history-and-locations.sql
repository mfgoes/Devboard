-- Workspace Sync history + per-device local folder locations.
--
-- Run this whole file in the Supabase SQL editor after
-- supabase/workspace-sync-rls-fix.sql.
--
-- These tables are intentionally append/lightweight:
-- - board_sync_events is an audit trail for sync/open/rename/delete/unlink attempts.
-- - board_device_locations remembers where each synced workspace was last opened
--   on each device. This lets the app help users reconnect relocated local folders
--   without storing paths in the board payload itself.

create table if not exists public.board_sync_events (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('create', 'sync', 'open', 'rename', 'delete', 'unlink')),
  status text not null default 'success' check (status in ('success', 'failure')),
  device_id text,
  device_label text,
  local_path_hint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists board_sync_events_board_created_idx
  on public.board_sync_events(board_id, created_at desc);

create table if not exists public.board_device_locations (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id text not null,
  device_label text,
  local_path_hint text,
  last_opened_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (board_id, device_id)
);

create index if not exists board_device_locations_board_updated_idx
  on public.board_device_locations(board_id, updated_at desc);

alter table public.board_sync_events enable row level security;
alter table public.board_device_locations enable row level security;

drop policy if exists "board_sync_events_select_owner" on public.board_sync_events;
drop policy if exists "board_sync_events_insert_owner" on public.board_sync_events;
drop policy if exists "board_device_locations_select_owner" on public.board_device_locations;
drop policy if exists "board_device_locations_insert_owner" on public.board_device_locations;
drop policy if exists "board_device_locations_update_owner" on public.board_device_locations;
drop policy if exists "board_device_locations_delete_owner" on public.board_device_locations;

create policy "board_sync_events_select_owner"
on public.board_sync_events
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.boards b
    where b.id = board_sync_events.board_id
      and public.is_workspace_owner(b.workspace_id)
  )
);

create policy "board_sync_events_insert_owner"
on public.board_sync_events
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.boards b
    where b.id = board_sync_events.board_id
      and public.is_workspace_owner(b.workspace_id)
  )
);

create policy "board_device_locations_select_owner"
on public.board_device_locations
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.boards b
    where b.id = board_device_locations.board_id
      and public.is_workspace_owner(b.workspace_id)
  )
);

create policy "board_device_locations_insert_owner"
on public.board_device_locations
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.boards b
    where b.id = board_device_locations.board_id
      and public.is_workspace_owner(b.workspace_id)
  )
);

create policy "board_device_locations_update_owner"
on public.board_device_locations
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.boards b
    where b.id = board_device_locations.board_id
      and public.is_workspace_owner(b.workspace_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.boards b
    where b.id = board_device_locations.board_id
      and public.is_workspace_owner(b.workspace_id)
  )
);

create policy "board_device_locations_delete_owner"
on public.board_device_locations
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.boards b
    where b.id = board_device_locations.board_id
      and public.is_workspace_owner(b.workspace_id)
  )
);

create or replace function public.touch_board_device_location_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_board_device_locations_updated_at on public.board_device_locations;
create trigger touch_board_device_locations_updated_at
before update on public.board_device_locations
for each row
execute function public.touch_board_device_location_updated_at();
