import {
  calendarExternalId,
  normalizeCalendarEventDate,
  toCalendarEventDate,
  APPLE_CALENDAR_SYNC_TASK,
} from '@/lib/apple-calendar-map';
import { shouldClassifyExistingCalendarItem, syncedCalendarItemStatus } from '@/lib/calendar-classified';
import { linkInsertedCalendarItems } from '@/lib/cross-source';
import { closeItems } from '@/lib/item-status';
import { supabase } from '@/lib/supabase';
import { isRunningInExpoGo } from 'expo';
import * as Calendar from 'expo-calendar/legacy';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export { calendarExternalId, toCalendarEventDate, APPLE_CALENDAR_SYNC_TASK } from '@/lib/apple-calendar-map';

export const APPLE_CALENDAR_PROVIDER = 'appcal';
export const APPLE_CALENDAR_SOURCE = 'apple_calendar';
const WINDOW_DAYS = 60;
const CLASSIFY_BATCH = 20;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export type DeviceCalendar = {
  id: string;
  title: string;
  sub: string | null;
};

type CalendarEventRead = {
  id: string;
  title: string;
  location: string | null;
  startDate: Date;
  allDay: boolean;
  calendarId: string;
};

type ExistingRow = {
  id: string;
  title: string | null;
  body: string | null;
  event_date: string | null;
  status: string | null;
  classified_at: string | null;
  external_id: string | null;
};

type SyncResult = { changed: boolean; created: number; dismissed: number };

type CalendarSyncListener = (result: SyncResult) => void;

let inFlight: Promise<SyncResult> | null = null;
const syncListeners = new Set<CalendarSyncListener>();

export function subscribeAppleCalendarSync(listener: CalendarSyncListener): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function emitAppleCalendarSync(result: SyncResult) {
  for (const listener of syncListeners) listener(result);
}

export function usesPreviewAppleCalendar(): boolean {
  return Platform.OS === 'web' || isRunningInExpoGo();
}

/** @deprecated Use usesPreviewAppleCalendar — Expo Go cannot read EventKit. */
export function appleCalendarNeedsDevBuild(): boolean {
  return usesPreviewAppleCalendar();
}

export async function requestAppleCalendarAccess(): Promise<boolean> {
  if (usesPreviewAppleCalendar()) return false;
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.status === 'granted') return true;
  const next = await Calendar.requestCalendarPermissionsAsync();
  return next.status === 'granted';
}

export async function listDeviceCalendars(): Promise<DeviceCalendar[]> {
  if (usesPreviewAppleCalendar()) return [];
  try {
    const granted = await Calendar.getCalendarPermissionsAsync();
    if (granted.status !== 'granted') return [];
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return calendars
      .filter((calendar) => calendar.id && calendar.title)
      .map((calendar) => ({
        id: calendar.id,
        title: calendar.title,
        sub: calendar.source?.name?.trim() || null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    console.warn('Could not list device calendars:', err);
    return [];
  }
}

export async function loadAppleCalendarConnection(): Promise<{
  connected: boolean;
  selectedIds: string[];
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { connected: false, selectedIds: [] };

  const { data, error } = await supabase
    .from('connections')
    .select('connected, selected_calendar_ids')
    .eq('user_id', user.id)
    .eq('provider', APPLE_CALENDAR_PROVIDER)
    .maybeSingle();

  if (error || !data) return { connected: false, selectedIds: [] };
  const ids = Array.isArray(data.selected_calendar_ids)
    ? data.selected_calendar_ids.filter((id): id is string => typeof id === 'string' && !!id)
    : [];
  return { connected: Boolean(data.connected), selectedIds: ids };
}

export async function saveAppleCalendarConnection(params: {
  connected: boolean;
  selectedIds: string[];
}): Promise<{ error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You need to be signed in.' };

  const { error } = await supabase.from('connections').upsert(
    {
      user_id: user.id,
      provider: APPLE_CALENDAR_PROVIDER,
      kind: 'calendar',
      connected: params.connected,
      selected_calendar_ids: params.selectedIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  );
  if (error) return { error: error.message };
  return {};
}

export async function syncAppleCalendar(opts?: { force?: boolean }): Promise<SyncResult> {
  const empty = { changed: false, created: 0, dismissed: 0 };
  if (inFlight) {
    const result = await inFlight;
    if (!opts?.force) return result;
  }
  inFlight = runSync()
    .catch((err) => {
      console.warn('Apple calendar sync failed:', err);
      return empty;
    })
    .then((result) => {
      emitAppleCalendarSync(result);
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function runSync(): Promise<SyncResult> {
  const empty = { changed: false, created: 0, dismissed: 0 };
  if (usesPreviewAppleCalendar()) return empty;

  const permission = await Calendar.getCalendarPermissionsAsync();
  if (permission.status !== 'granted') return empty;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { connected, selectedIds } = await loadAppleCalendarConnection();
  if (!connected || !selectedIds.length) return empty;

  const start = startOfLocalDay(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + WINDOW_DAYS);

  const events = await readNativeEvents(selectedIds, start, end);
  const { data: existingRows, error: existingError } = await supabase
    .from('items')
    .select('id, title, body, event_date, status, classified_at, external_id')
    .eq('user_id', user.id)
    .eq('external_source', APPLE_CALENDAR_SOURCE);

  if (existingError) {
    console.error('Failed to load calendar items:', existingError.message);
    return empty;
  }

  const byExternal = new Map(
    ((existingRows ?? []) as ExistingRow[])
      .filter((row) => row.external_id)
      .map((row) => [row.external_id as string, row]),
  );

  const seen = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: {
    id: string;
    title: string;
    body: string | null;
    event_date: string;
    status: string;
    classified_at: string | null;
  }[] = [];
  const classifyPayload: { id: string; title: string; location: string | null; start: string; all_day: boolean }[] = [];

  for (const event of events) {
    if (!event.id || !event.title?.trim()) continue;
    const startDate = asDate(event.startDate);
    if (Number.isNaN(startDate.getTime())) continue;
    const eventDate = toCalendarEventDate(startDate, Boolean(event.allDay));
    const externalId = calendarExternalId(event.id, eventDate);
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const location = event.location?.replace(/\s+/g, ' ').trim() || null;
    const title = event.title.replace(/\s+/g, ' ').trim();
    const existing = byExternal.get(externalId);

    if (!existing) {
      toInsert.push({
        user_id: user.id,
        created_by: user.id,
        title,
        body: location,
        event_date: eventDate,
        source: 'calendar',
        source_label: 'Apple Calendar',
        external_id: externalId,
        external_source: APPLE_CALENDAR_SOURCE,
        calendar_provider: 'apple',
        status: 'open',
        kind: 'occurrence',
        occurs_at: eventDate,
        due_at: null,
        confidence: 'high',
        prep_origin: 'none',
      });
      continue;
    }

    const status = syncedCalendarItemStatus(existing.status);
    const bodyChanged = (existing.body || null) !== location;
    const titleChanged = (existing.title || '') !== title;
    const dateChanged =
      normalizeCalendarEventDate(existing.event_date) !== normalizeCalendarEventDate(eventDate);
    const reclassify = shouldClassifyExistingCalendarItem({
      classifiedAt: existing.classified_at,
      titleChanged,
      dateChanged,
    });
    if (titleChanged || bodyChanged || dateChanged) {
      toUpdate.push({
        id: existing.id,
        title,
        body: location,
        event_date: eventDate,
        status,
        classified_at: titleChanged || dateChanged ? null : existing.classified_at,
      });
    }
    if (reclassify) {
      classifyPayload.push({
        id: existing.id,
        title,
        location,
        start: eventDate,
        all_day: Boolean(event.allDay),
      });
    }
  }

  let created = 0;
  if (toInsert.length) {
    const { data: inserted, error: insertError } = await supabase
      .from('items')
      .upsert(toInsert, { onConflict: 'user_id,external_source,external_id' })
      .select('id, title, body, event_date, external_id');
    if (insertError) {
      console.error('Failed to upsert calendar items:', insertError.message);
    } else {
      created = inserted?.length ?? 0;
      await linkInsertedCalendarItems(
        supabase,
        user.id,
        (inserted ?? []).map((row) => row.id),
      );
      for (const row of inserted ?? []) {
        const start = typeof row.event_date === 'string' ? row.event_date : '';
        classifyPayload.push({
          id: row.id,
          title: row.title,
          location: row.body,
          start,
          all_day: !/[T ]\d{2}:\d{2}/.test(start) || /T00:00/.test(start),
        });
      }
    }
  }

  for (const row of toUpdate) {
    const { error } = await supabase
      .from('items')
      .update({
        title: row.title,
        body: row.body,
        event_date: row.event_date,
        occurs_at: row.event_date,
        kind: 'occurrence',
        status: row.status,
        classified_at: row.classified_at,
      })
      .eq('id', row.id);
    if (error) console.error('Failed to update calendar item:', error.message);
  }

  let dismissed = 0;
  const missing = ((existingRows ?? []) as ExistingRow[]).filter((row) => {
    if (!row.external_id || !seen.has(row.external_id)) {
      return row.status === 'open';
    }
    return false;
  });
  if (missing.length) {
    const ids = missing.map((row) => row.id);
    const { error } = await closeItems(ids, 'dismissed');
    if (error) console.error('Failed to dismiss removed calendar items:', error.message);
    else dismissed = ids.length;
  }

  let checklists = 0;
  if (classifyPayload.length) {
    checklists = await classifyNewItems(classifyPayload);
  }

  const changed = created > 0 || dismissed > 0 || toUpdate.length > 0 || checklists > 0;
  return { changed, created, dismissed };
}

async function classifyNewItems(
  items: { id: string; title: string; location: string | null; start: string; all_day: boolean }[],
): Promise<number> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) return 0;

  let checklists = 0;
  for (let i = 0; i < items.length; i += CLASSIFY_BATCH) {
    const batch = items.slice(i, i + CLASSIFY_BATCH);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/calendar-classify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: batch }),
      });
      const payload = (await res.json().catch(() => ({}))) as { checklists?: number; error?: string };
      if (!res.ok) {
        console.error('Calendar classify failed:', payload.error || res.status);
        continue;
      }
      checklists += payload.checklists ?? 0;
    } catch (err) {
      console.error('Calendar classify failed:', err);
    }
  }
  return checklists;
}

/**
 * iOS decides when this task actually runs. Background App Refresh can delay or skip
 * wakes entirely — this is best-effort periodic sync, not reliable real-time calendar updates.
 */
export async function registerAppleCalendarBackgroundSync(): Promise<void> {
  if (Platform.OS === 'web' || isRunningInExpoGo()) return;
  try {
    if (!TaskManager.isTaskDefined(APPLE_CALENDAR_SYNC_TASK)) return;
    const available = await TaskManager.isAvailableAsync();
    if (!available) return;
    const registered = await TaskManager.isTaskRegisteredAsync(APPLE_CALENDAR_SYNC_TASK);
    if (registered) return;
    await BackgroundFetch.registerTaskAsync(APPLE_CALENDAR_SYNC_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (err) {
    console.warn('Background calendar sync is unavailable:', err);
  }
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

async function readNativeEvents(calendarIds: string[], start: Date, end: Date): Promise<CalendarEventRead[]> {
  const events = await Calendar.getEventsAsync(calendarIds, start, end);
  return events
    .filter((event) => event.id && event.title)
    .map((event) => ({
      id: event.id,
      title: event.title,
      location: event.location,
      startDate: asDate(event.startDate),
      allDay: Boolean(event.allDay),
      calendarId: event.calendarId,
    }));
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
