import type { User } from '@supabase/supabase-js';
import type { BoardData } from '../types';
import { supabase } from './supabase';
import { summarizeBoardContent, type WorkspaceContentSummary } from './workspaceManager';

const DEFAULT_WORKSPACE_NAME = 'My DevBoard Sync';

export interface CloudBoardSummary {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string | null;
  contentSummary?: WorkspaceContentSummary;
}

export interface CloudWorkspaceLocation {
  id: string;
  boardId: string;
  deviceId: string;
  deviceLabel: string | null;
  localPathHint: string | null;
  lastOpenedAt: string;
  lastSyncedAt: string | null;
  updatedAt: string;
}

export interface CloudSyncContext {
  eventType: 'create' | 'sync' | 'open' | 'rename' | 'delete' | 'unlink';
  status?: 'success' | 'failure';
  deviceId?: string;
  deviceLabel?: string;
  localPathHint?: string | null;
  metadata?: Record<string, unknown>;
}

export function cloudTimestamp(value: string): number {
  return new Date(value).getTime();
}

interface WorkspaceRow {
  id: string;
  name: string;
}

interface BoardRow {
  id: string;
  workspace_id: string;
  title: string;
  board_data: BoardData;
  created_at: string;
  updated_at: string;
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

function mapBoardSummary(row: { id: string; workspace_id: string; title: string; created_at: string; updated_at: string; last_opened_at?: string | null; board_data?: BoardData | null }): CloudBoardSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at ?? null,
    contentSummary: summarizeBoardContent(row.board_data),
  };
}

async function ensurePersonalCloudWorkspace(user: User): Promise<WorkspaceRow> {
  const client = requireSupabase();

  const { data: ownedWorkspace, error: ownedWorkspaceError } = await client
    .from('workspaces')
    .select('id, name')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<WorkspaceRow>();

  if (ownedWorkspaceError) throw ownedWorkspaceError;
  if (ownedWorkspace) return ownedWorkspace;

  const { data: createdWorkspace, error: createWorkspaceError } = await client
    .from('workspaces')
    .insert({
      owner_id: user.id,
      name: DEFAULT_WORKSPACE_NAME,
    })
    .select('id, name')
    .single<WorkspaceRow>();

  if (createWorkspaceError) throw createWorkspaceError;
  return createdWorkspace;
}

export async function listCloudBoards(user: User): Promise<CloudBoardSummary[]> {
  const client = requireSupabase();
  const workspace = await ensurePersonalCloudWorkspace(user);

  const { data, error } = await client
    .from('boards')
    .select('id, workspace_id, title, created_at, updated_at, last_opened_at, board_data')
    .eq('workspace_id', workspace.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => mapBoardSummary({
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    title: row.title as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_opened_at: row.last_opened_at as string | null,
    board_data: row.board_data as BoardData | null,
  }));
}

export async function createCloudBoard(user: User, title: string, boardData: BoardData): Promise<CloudBoardSummary> {
  const client = requireSupabase();
  const workspace = await ensurePersonalCloudWorkspace(user);

  const { data, error } = await client
    .from('boards')
    .insert({
      workspace_id: workspace.id,
      title,
      schema_version: boardData.schemaVersion ?? 3,
      board_data: { ...boardData, boardTitle: title },
      created_by: user.id,
      last_opened_at: new Date().toISOString(),
    })
    .select('id, workspace_id, title, created_at, updated_at, last_opened_at, board_data')
    .single();

  if (error) throw error;

  return mapBoardSummary(data as { id: string; workspace_id: string; title: string; created_at: string; updated_at: string; last_opened_at?: string | null; board_data?: BoardData | null });
}

export async function updateCloudBoard(boardId: string, title: string, boardData: BoardData): Promise<CloudBoardSummary> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('boards')
    .update({
      title,
      schema_version: boardData.schemaVersion ?? 3,
      board_data: { ...boardData, boardTitle: title },
      last_opened_at: new Date().toISOString(),
    })
    .eq('id', boardId)
    .is('deleted_at', null)
    .select('id, workspace_id, title, created_at, updated_at, last_opened_at, board_data')
    .single();

  if (error) throw error;

  return mapBoardSummary(data as { id: string; workspace_id: string; title: string; created_at: string; updated_at: string; last_opened_at?: string | null; board_data?: BoardData | null });
}

export async function renameCloudBoard(boardId: string, title: string): Promise<CloudBoardSummary> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('boards')
    .update({
      title,
      last_opened_at: new Date().toISOString(),
    })
    .eq('id', boardId)
    .is('deleted_at', null)
    .select('id, workspace_id, title, created_at, updated_at, last_opened_at, board_data')
    .single();

  if (error) throw error;

  return mapBoardSummary(data as { id: string; workspace_id: string; title: string; created_at: string; updated_at: string; last_opened_at?: string | null; board_data?: BoardData | null });
}

export async function loadCloudBoard(boardId: string): Promise<BoardData> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('boards')
    .select('id, workspace_id, title, board_data, created_at, updated_at')
    .eq('id', boardId)
    .is('deleted_at', null)
    .single<BoardRow>();

  if (error) throw error;
  void client
    .from('boards')
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', boardId)
    .is('deleted_at', null)
    .then(({ error: updateError }) => {
      if (updateError) console.warn('Could not update cloud last_opened_at', updateError);
    });
  return data.board_data;
}

export async function deleteCloudBoard(boardId: string): Promise<void> {
  const client = requireSupabase();

  const { error } = await client
    .from('boards')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', boardId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error) throw error;
}

export async function listCloudWorkspaceLocations(boardIds: string[]): Promise<Record<string, CloudWorkspaceLocation[]>> {
  const ids = Array.from(new Set(boardIds.filter(Boolean)));
  if (ids.length === 0) return {};

  const client = requireSupabase();
  const { data, error } = await client
    .from('board_device_locations')
    .select('id, board_id, device_id, device_label, local_path_hint, last_opened_at, last_synced_at, updated_at')
    .in('board_id', ids)
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('Could not load workspace locations', error);
    return {};
  }

  const grouped: Record<string, CloudWorkspaceLocation[]> = {};
  for (const row of data ?? []) {
    const location: CloudWorkspaceLocation = {
      id: row.id as string,
      boardId: row.board_id as string,
      deviceId: row.device_id as string,
      deviceLabel: row.device_label as string | null,
      localPathHint: row.local_path_hint as string | null,
      lastOpenedAt: row.last_opened_at as string,
      lastSyncedAt: row.last_synced_at as string | null,
      updatedAt: row.updated_at as string,
    };
    if (!grouped[location.boardId]) grouped[location.boardId] = [];
    grouped[location.boardId].push(location);
  }

  return grouped;
}

export async function recordCloudSyncEvent(boardId: string, context: CloudSyncContext): Promise<void> {
  const client = requireSupabase();

  const { error } = await client
    .from('board_sync_events')
    .insert({
      board_id: boardId,
      event_type: context.eventType,
      status: context.status ?? 'success',
      device_id: context.deviceId ?? null,
      device_label: context.deviceLabel ?? null,
      local_path_hint: context.localPathHint ?? null,
      metadata: context.metadata ?? {},
    });

  if (error) throw error;
}

export async function upsertCloudWorkspaceLocation(
  boardId: string,
  location: {
    deviceId: string;
    deviceLabel?: string;
    localPathHint?: string | null;
    lastOpenedAt?: string;
    lastSyncedAt?: string | null;
  },
): Promise<void> {
  const client = requireSupabase();
  const payload: Record<string, unknown> = {
    board_id: boardId,
    device_id: location.deviceId,
    device_label: location.deviceLabel ?? null,
    local_path_hint: location.localPathHint ?? null,
    last_opened_at: location.lastOpenedAt ?? new Date().toISOString(),
  };
  if (location.lastSyncedAt !== undefined) payload.last_synced_at = location.lastSyncedAt;

  const { error } = await client
    .from('board_device_locations')
    .upsert(payload, { onConflict: 'board_id,device_id' });

  if (error) throw error;
}

export async function rememberCloudSyncContext(boardId: string, context: CloudSyncContext): Promise<void> {
  try {
    await recordCloudSyncEvent(boardId, context);
  } catch (err) {
    console.warn('Could not record cloud sync event', err);
  }

  if (!context.deviceId) return;
  try {
    const metadataLastSyncedAt = typeof context.metadata?.lastSyncedAt === 'number'
      ? new Date(context.metadata.lastSyncedAt).toISOString()
      : typeof context.metadata?.lastSyncedAt === 'string'
        ? context.metadata.lastSyncedAt
        : undefined;
    await upsertCloudWorkspaceLocation(boardId, {
      deviceId: context.deviceId,
      deviceLabel: context.deviceLabel,
      localPathHint: context.localPathHint,
      lastOpenedAt: new Date().toISOString(),
      lastSyncedAt: ['create', 'sync'].includes(context.eventType) && context.status !== 'failure'
        ? new Date().toISOString()
        : metadataLastSyncedAt,
    });
  } catch (err) {
    console.warn('Could not update cloud workspace location', err);
  }
}
