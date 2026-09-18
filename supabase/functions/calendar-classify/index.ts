import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CALENDAR_CLASSIFY_BATCH,
  applyCalendarClassification,
  classifyCalendarEvents,
  type CalendarIncoming,
} from '../_shared/calendar-classify.ts';
import { loadHousehold } from '../_shared/household.ts';
import { loadHouseholdFacts } from '../_shared/family-facts.ts';

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!supabaseUrl || !serviceRoleKey || !anthropicKey) {
      return json({ error: 'Server misconfiguration' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) return json({ error: 'Invalid or expired session' }, 401);

    const body = (await req.json()) as { items?: CalendarIncoming[] };
    const incoming = Array.isArray(body.items) ? body.items.slice(0, CALENDAR_CLASSIFY_BATCH) : [];
    if (!incoming.length) return json({ success: true, classified: 0, checklists: 0 });

    const ids = incoming.map((row) => row.id);
    const { data: owned, error: ownedError } = await supabase
      .from('items')
      .select('id')
      .eq('user_id', user.id)
      .in('id', ids);
    if (ownedError) return json({ error: 'Failed to load items' }, 500);

    const allowed = new Set(((owned ?? []) as { id: string }[]).map((row) => row.id));
    const events = incoming.filter((row) => allowed.has(row.id) && row.title.trim());
    if (!events.length) return json({ success: true, classified: 0, checklists: 0 });

    const household = await loadHousehold(supabase, user.id);
    const knowledge = await loadHouseholdFacts(supabase, { userId: user.id });
    const classified = await classifyCalendarEvents(anthropicKey, events, household, knowledge);
    const checklists = await applyCalendarClassification(supabase, {
      userId: user.id,
      household,
      events,
      classified,
    });

    return json({ success: true, classified: classified.length, checklists });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}
