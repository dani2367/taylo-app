import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  classifyAndApplyCalendarItems,
  type CalendarIncoming,
} from '../_shared/calendar-classify.ts';
import { loadHousehold } from '../_shared/household.ts';
import {
  getFreshMicrosoftAccessToken,
  refreshMicrosoftAccessToken,
  type MicrosoftConnection,
} from '../_shared/microsoft.ts';

const WINDOW_DAYS = 60;
const OUTLOOK_CALENDAR_SOURCE = 'outlook_calendar';
const APPLE_CALENDAR_SOURCE = 'apple_calendar';
const GRAPH_CALENDAR_VIEW = 'https://graph.microsoft.com/v1.0/me/calendarView';

type Connection = MicrosoftConnection & { connected?: boolean };

type GraphEvent = {
  id?: string;
  subject?: string;
  isCancelled?: boolean;
  isAllDay?: boolean;
  start?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
};

type ExistingRow = {
  id: string;
  title: string | null;
  body: string | null;
  event_date: string | null;
  status: string | null;
  urgency_level: string | null;
  action_description: string | null;
  external_id: string | null;
  checklists: { id: string }[] | { id: string } | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anthropicKey) {
      console.error('Missing required environment variables');
      return json({ error: 'Server misconfiguration' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let targetUserId: string | undefined;
    try {
      const body = (await req.json()) as { user_id?: string };
      targetUserId = typeof body?.user_id === 'string' ? body.user_id : undefined;
    } catch {
      // Scheduled invocations may have an empty body.
    }

    let connectionsQuery = supabase
      .from('connections')
      .select('user_id, refresh_token, access_token, expires_at, connected')
      .eq('provider', 'microsoft')
      .eq('connected', true)
      .not('refresh_token', 'is', null);

    if (targetUserId) {
      connectionsQuery = connectionsQuery.eq('user_id', targetUserId);
    }

    const { data: connections, error: connectionsError } = await connectionsQuery;
    if (connectionsError) {
      console.error('Failed to load connections:', connectionsError.message);
      return json({ error: 'Failed to load connections' }, 500);
    }

    const stats = {
      connections: connections?.length ?? 0,
      created: 0,
      updated: 0,
      dismissed: 0,
      checklists: 0,
      spotlight: 0,
      possible_duplicates: 0,
      errors: 0,
    };

    for (const connection of (connections ?? []) as Connection[]) {
      if (!connection.refresh_token || !connection.user_id) continue;
      console.log('Syncing Outlook calendar for user:', connection.user_id);
      try {
        const result = await syncUser(supabase, anthropicKey, connection);
        stats.created += result.created;
        stats.updated += result.updated;
        stats.dismissed += result.dismissed;
        stats.checklists += result.checklists;
        stats.possible_duplicates += result.possibleDuplicates;
        if (result.created > 0 || result.checklists > 0) {
          const regenerated = await regenerateSpotlight(
            supabaseUrl,
            serviceRoleKey,
            connection.user_id,
          );
          if (regenerated) stats.spotlight += 1;
        }
      } catch (err) {
        stats.errors += 1;
        console.error('Failed to sync Outlook calendar for user:', connection.user_id, err);
      }
    }

    return json({ success: true, ...stats });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

async function syncUser(
  supabase: SupabaseClient,
  anthropicKey: string,
  connection: Connection,
): Promise<{
  created: number;
  updated: number;
  dismissed: number;
  checklists: number;
  possibleDuplicates: number;
}> {
  let accessToken = await getFreshMicrosoftAccessToken(supabase, connection);
  const window = londonWindow();
  let events: GraphEvent[];
  try {
    events = await fetchCalendarView(accessToken, window);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (!message.includes('(401)')) throw err;
    accessToken = await refreshMicrosoftAccessToken(
      supabase,
      connection.user_id,
      connection.refresh_token,
    );
    events = await fetchCalendarView(accessToken, window);
  }

  console.log('Calendar events fetched:', events.length, 'window:', window.start, '->', window.end);

  const { data: existingRows, error: existingError } = await supabase
    .from('items')
    .select('id, title, body, event_date, status, urgency_level, action_description, external_id, checklists(id)')
    .eq('user_id', connection.user_id)
    .eq('external_source', OUTLOOK_CALENDAR_SOURCE);

  if (existingError) {
    throw new Error(`Failed to load calendar items: ${existingError.message}`);
  }

  const byExternal = new Map(
    ((existingRows ?? []) as ExistingRow[])
      .filter((row) => row.external_id)
      .map((row) => [row.external_id as string, row]),
  );

  const seen = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; title: string; body: string | null; event_date: string; status: string }[] = [];
  const classifyPayload: CalendarIncoming[] = [];
  const cancelledIds: string[] = [];

  for (const event of events) {
    if (!event.id || !event.subject?.trim()) continue;
    const eventDate = graphStartToEventDate(event.start?.dateTime, Boolean(event.isAllDay));
    if (!eventDate) continue;
    if (seen.has(event.id)) continue;
    seen.add(event.id);

    const existing = byExternal.get(event.id);
    if (event.isCancelled) {
      if (existing && existing.status === 'open') cancelledIds.push(existing.id);
      continue;
    }

    const location = event.location?.displayName?.replace(/\s+/g, ' ').trim() || null;
    const title = event.subject.replace(/\s+/g, ' ').trim();

    if (!existing) {
      toInsert.push({
        user_id: connection.user_id,
        title,
        body: location,
        event_date: eventDate,
        source: 'calendar',
        source_label: 'Outlook Calendar',
        external_id: event.id,
        external_source: OUTLOOK_CALENDAR_SOURCE,
        calendar_provider: 'outlook',
        status: 'open',
      });
      continue;
    }

    const status =
      existing.status === 'done' || existing.status === 'delegated' ? existing.status : 'open';
    const bodyChanged = (existing.body || null) !== location;
    const titleChanged = (existing.title || '') !== title;
    const dateChanged = normalizeEventDate(existing.event_date) !== eventDate;
    if (titleChanged || bodyChanged || dateChanged || existing.status === 'dismissed') {
      toUpdate.push({ id: existing.id, title, body: location, event_date: eventDate, status });
    }
    if (!hasChecklist(existing.checklists) && !existing.action_description?.trim() && existing.urgency_level == null) {
      classifyPayload.push({
        id: existing.id,
        title,
        location,
        start: eventDate,
        all_day: Boolean(event.isAllDay),
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
      throw new Error(`Failed to upsert calendar items: ${insertError.message}`);
    }
    created = inserted?.length ?? 0;
    for (const row of inserted ?? []) {
      console.log('Created calendar item:', row.title, '->', row.event_date);
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

  let updated = 0;
  for (const row of toUpdate) {
    const { error } = await supabase
      .from('items')
      .update({
        title: row.title,
        body: row.body,
        event_date: row.event_date,
        status: row.status,
      })
      .eq('id', row.id);
    if (error) console.error('Failed to update calendar item:', error.message);
    else updated += 1;
  }

  const missing = ((existingRows ?? []) as ExistingRow[]).filter((row) => {
    if (!row.external_id || seen.has(row.external_id)) return false;
    return row.status === 'open';
  });
  const dismissIds = [...new Set([...cancelledIds, ...missing.map((row) => row.id)])];
  let dismissed = 0;
  if (dismissIds.length) {
    const { error } = await supabase
      .from('items')
      .update({ status: 'dismissed' })
      .in('id', dismissIds)
      .eq('status', 'open');
    if (error) console.error('Failed to dismiss removed calendar items:', error.message);
    else dismissed = dismissIds.length;
  }

  let checklists = 0;
  if (classifyPayload.length) {
    const household = await loadHousehold(supabase, connection.user_id);
    const applied = await classifyAndApplyCalendarItems(
      supabase,
      anthropicKey,
      connection.user_id,
      household,
      classifyPayload,
    );
    checklists = applied.checklists;
    console.log('Calendar classify:', applied.classified, 'checklists:', applied.checklists);
  }

  const possibleDuplicates = await flagCrossSourceDuplicates(supabase, connection.user_id);
  return { created, updated, dismissed, checklists, possibleDuplicates };
}

async function fetchCalendarView(
  accessToken: string,
  window: { start: string; end: string },
): Promise<GraphEvent[]> {
  const params = new URLSearchParams({
    startDateTime: window.start,
    endDateTime: window.end,
    $select: 'id,subject,start,location,isCancelled,isAllDay',
    $orderby: 'start/dateTime',
    $top: '100',
  });

  const events: GraphEvent[] = [];
  let url: string | null = `${GRAPH_CALENDAR_VIEW}?${params.toString()}`;

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        Prefer: 'outlook.timezone="Europe/London"',
      },
    });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`Graph calendarView failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = JSON.parse(body) as { value?: GraphEvent[]; '@odata.nextLink'?: string };
    events.push(...(data.value ?? []));
    url = data['@odata.nextLink'] ?? null;
  }

  return events;
}

function graphStartToEventDate(dateTime: string | undefined, isAllDay: boolean): string | null {
  if (!dateTime) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(dateTime);
  if (!match) return null;
  if (isAllDay || !match[2]) return match[1];
  return `${match[1]}T${match[2]}:${match[3]}:00`;
}

function normalizeEventDate(value: string | null): string {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!match) return value.slice(0, 19);
  if (!match[2] || (match[2] === '00' && match[3] === '00' && !/[T ]/.test(value))) {
    return match[1];
  }
  return `${match[1]}T${match[2]}:${match[3]}:00`;
}

function londonWindow(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const y = Number(lookup.year);
  const m = Number(lookup.month);
  const d = Number(lookup.day);
  const startUtc = Date.UTC(y, m - 1, d);
  const endUtc = startUtc + WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return {
    start: `${ymdFromUtc(startUtc)}T00:00:00`,
    end: `${ymdFromUtc(endUtc)}T00:00:00`,
  };
}

function ymdFromUtc(ms: number): string {
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hasChecklist(raw: ExistingRow['checklists']): boolean {
  if (!raw) return false;
  const lists = Array.isArray(raw) ? raw : [raw];
  return lists.some((list) => Boolean(list?.id));
}

async function flagCrossSourceDuplicates(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('items')
    .select('id, title, event_date, external_source, status')
    .eq('user_id', userId)
    .eq('source', 'calendar')
    .eq('status', 'open')
    .in('external_source', [OUTLOOK_CALENDAR_SOURCE, APPLE_CALENDAR_SOURCE]);

  if (error) {
    console.error('Duplicate check failed:', error.message);
    return 0;
  }

  const groups = new Map<string, { outlook: number; apple: number; title: string; date: string }>();
  for (const row of data ?? []) {
    const title = (row.title || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const date = normalizeEventDate(row.event_date).slice(0, 10);
    if (!title || !date) continue;
    const key = `${date}|${title}`;
    const group = groups.get(key) ?? { outlook: 0, apple: 0, title, date };
    if (row.external_source === OUTLOOK_CALENDAR_SOURCE) group.outlook += 1;
    if (row.external_source === APPLE_CALENDAR_SOURCE) group.apple += 1;
    groups.set(key, group);
  }

  const duplicates = [...groups.values()].filter((group) => group.outlook > 0 && group.apple > 0);
  if (duplicates.length) {
    console.warn(
      'Possible Apple/Outlook calendar duplicates (not auto-merged):',
      JSON.stringify(duplicates),
    );
  }
  return duplicates.length;
}

async function regenerateSpotlight(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/taylo-spotlight`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: true, user_id: userId }),
    });
    const payload = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!res.ok || !payload.success) {
      console.error('Spotlight refresh failed:', payload.error || res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Spotlight refresh failed:', err);
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
