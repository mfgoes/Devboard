-- Workspace Sync RLS repair for:
--   infinite recursion detected in policy for relation "workspace_members"
--
-- Run this whole file in the Supabase SQL editor.
--
-- V1 Workspace Sync uses personal workspaces owned by auth.uid(). This repair
-- removes any older recursive team/member policies and recreates a simple,
-- owner-based policy set. The workspace_members table is left usable for future
-- collaboration, but Workspace Sync no longer depends on it.

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.boards enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('workspaces', 'workspace_members', 'boards')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

drop function if exists public.is_workspace_owner(uuid);

create function public.is_workspace_owner(workspace_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = workspace_uuid
      and w.owner_id = auth.uid()
  );
$$;

grant execute on function public.is_workspace_owner(uuid) to authenticated;

create policy "workspaces_select"
on public.workspaces
for select
to authenticated
using (owner_id = auth.uid());

create policy "workspaces_insert"
on public.workspaces
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "workspaces_update"
on public.workspaces
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "workspaces_delete"
on public.workspaces
for delete
to authenticated
using (owner_id = auth.uid());

create policy "workspace_members_select_own"
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid());

create policy "workspace_members_insert_own"
on public.workspace_members
for insert
to authenticated
with check (user_id = auth.uid());

create policy "workspace_members_update_own"
on public.workspace_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "workspace_members_delete_own"
on public.workspace_members
for delete
to authenticated
using (user_id = auth.uid());

create policy "boards_select_owner"
on public.boards
for select
to authenticated
using (public.is_workspace_owner(workspace_id));

create policy "boards_insert_owner"
on public.boards
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_workspace_owner(workspace_id)
);

create policy "boards_update_owner"
on public.boards
for update
to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

create policy "boards_delete_owner"
on public.boards
for delete
to authenticated
using (public.is_workspace_owner(workspace_id));
