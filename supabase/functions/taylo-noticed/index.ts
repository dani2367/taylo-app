import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { householdVoiceBlock, loadHousehold, type Household } from '../_shared/household.ts';
import { loadHouseholdFacts } from '../_shared/family-facts.ts';
import {
  ACTION_LIBRARY_SEED,
  materializeActionHolds,
  noticedActionCandidates,
  persistActionHolds,
  vaccinationCopyIsSafe,
  type ActionChild,
  type ActionLibraryRecord,
  type CalendarOccurrence,
  type LinkedActionItem,
} from '../_shared/action-library.ts';
import { ageFromBirthday } from '../_shared/child-age.ts';
import {
  insightRepeatsCaptured,
  isVagueNoticed,
  looksLikeMentalLoad,
} from '../_shared/noticed.ts';
import { HOME_OVERFLOW_RANK_BASE, isSameLondonDay } from '../_shared/placement.ts';
import {
  defaultVisibilityForWho,
  loadViewerContext,
  restrictHouseholdFamilyMembers,
  restrictVisibleItems,
} from '../_shared/item-visibility.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-5';
const MAX_FACTS = 50;

type ItemRow = {
  id: string;
  title: string | null;
  category: string | null;
  event_date: string | null;
  who_it_affects: string | null;
  collections: { status: string | null } | { status: string | null }[] | null;
};

type FactRow = { subject: string; fact: string; category: string | null };
type ConvRow = { id: string; title: string | null; kind: string | null };
type MsgRow = { conversation_id: string; sender: string; body: string; created_at: string };
type SpotlightRow = { item_id: string | null; reason_text: string | null };
type MemberRow = {
  id: string;
  role: string | null;
  first_name: string | null;
  birthday: string | null;
  school: string | null;
};
type PersonContext = {
  id: string;
  name: string;
  role: string;
  birthday: string | null;
  school: string | null;
  ageLabel: string | null;
  ageMonths: number | null;
};

const MENTAL_LOAD_THEMES = [
  'health bookings — dentist, GP, optician, hearing',
  'clothes, shoes, next size up, uniform that might be snug',
  'routine vaccination checks and age-based NHS health reviews (never name a specific vaccine, dose, or birth cohort)',
  'haircuts and everyday care that slips the mind',
  'kit they may be growing out of — car seat, bike helmet, wellies, buggy',
  'school or nursery admin — spare clothes, labels, photos, water bottle',
] as const;

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
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

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

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );

    if (authError || !user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    const force = await readForce(req);
    const latestRow = await loadLatestNoticed(supabase, user.id);
    const lastInsight = cachedInsight(latestRow);

    const viewer = await loadViewerContext(supabase, user.id);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const [household, people, knowledge, library, recentChat, spotlight] = await Promise.all([
      loadHousehold(supabase, user.id),
      loadPeople(supabase, user.id),
      loadHouseholdFacts(supabase, { userId: user.id, householdId: viewer.householdId }),
      loadActionLibrary(supabase),
      loadRecentChat(supabase, user.id),
      loadSpotlight(supabase, user.id),
    ]);
    const actionChildren: ActionChild[] = people
      .filter((person) => person.role === 'child')
      .map((person) => ({
        id: person.id,
        first_name: person.name,
        birthday: person.birthday,
        role: person.role,
      }));
    await materializeLibraryHolds(supabase, {
      userId: user.id,
      householdId: viewer.householdId,
      household,
      children: actionChildren,
      facts: knowledge.facts,
      actions: library,
      today,
    });

    const { data: itemRows, error: itemsError } = await restrictVisibleItems(
      supabase.from('items').select('id, title, category, event_date, who_it_affects, collections(status)'),
      viewer,
    )
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(80);

    if (itemsError) {
      console.error('Failed to load items:', itemsError.message);
      return json({ error: 'Failed to load items' }, 500);
    }

    const items = ((itemRows ?? []) as ItemRow[]).filter((item) => isActiveCollection(item.collections));
    const capturedTitles = items
      .map((item) => item.title)
      .filter((title): title is string => !!title);
    const facts = await loadFacts(supabase, user.id);
    const actionCandidates = noticedActionCandidates({
      actions: library,
      children: actionChildren,
      today,
    });

    if (!force) {
      const generatedAt = latestRow?.generated_at;
      if (
        isSameLondonDay(generatedAt) &&
        lastInsight &&
        !isVagueNoticed(lastInsight) &&
        looksLikeMentalLoad(lastInsight) &&
        !insightRepeatsCaptured(lastInsight, capturedTitles)
      ) {
        return json({ success: true, skipped: true, generated_at: generatedAt });
      }
    }

    let insight: string | null = null;
    try {
      insight = await observe(anthropicKey, {
        items,
        facts,
        recentChat,
        household,
        spotlight,
        people,
        lastInsight,
        capturedTitles,
        actionCandidates,
      });
    } catch (err) {
      console.error('Noticed generation failed:', err);
      insight = null;
    }

    const { error: deleteError } = await supabase.from('home_noticed').delete().eq('user_id', user.id);
    if (deleteError) {
      console.error('Failed to clear noticed:', deleteError.message);
      return json({ error: 'Failed to save noticed' }, 500);
    }

    if (!insight) {
      return json({ success: true, skipped: false, insight: null });
    }

    const generatedAt = new Date().toISOString();
    const { error: insertError } = await supabase.from('home_noticed').insert({
      user_id: user.id,
      insight_text: insight,
      generated_at: generatedAt,
    });
    if (insertError) {
      console.error('Failed to insert noticed:', insertError.message);
      return json({ error: 'Failed to save noticed' }, 500);
    }

    return json({ success: true, skipped: false, generated_at: generatedAt, insight });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

async function readForce(req: Request): Promise<boolean> {
  try {
    const body = (await req.json()) as { force?: unknown };
    return Boolean(body?.force);
  } catch {
    return false;
  }
}

function isActiveCollection(raw: ItemRow['collections']): boolean {
  const collection = Array.isArray(raw) ? raw[0] ?? null : raw;
  return !collection || collection.status === 'active';
}

async function loadSpotlight(supabase: SupabaseClient, userId: string): Promise<SpotlightRow[]> {
  const { data, error } = await supabase
    .from('home_spotlight')
    .select('item_id, reason_text')
    .eq('user_id', userId)
    .lt('rank', HOME_OVERFLOW_RANK_BASE)
    .order('rank', { ascending: true });

  if (error) {
    console.error('Failed to load spotlight:', error.message);
    return [];
  }
  return (data ?? []) as SpotlightRow[];
}

async function loadFacts(supabase: SupabaseClient, userId: string): Promise<FactRow[]> {
  const { facts, members } = await loadHouseholdFacts(supabase, { userId });
  return facts
    .filter((row) => row.status === 'active')
    .slice(0, MAX_FACTS)
    .map((row) => {
      const member = members.find((person) => person.id === row.person_id);
      return {
        subject: member?.first_name?.trim() || row.subject || 'family',
        fact: row.content,
        category: row.category ?? null,
      };
    });
}

async function loadRecentChat(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: convs, error: convError } = await supabase
    .from('conversations')
    .select('id, title, kind')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(4);

  if (convError) {
    console.error('Failed to load conversations:', convError.message);
    return '';
  }

  const threads = (convs ?? []) as ConvRow[];
  if (!threads.length) return '';

  const { data: msgs, error: msgError } = await supabase
    .from('messages')
    .select('conversation_id, sender, body, created_at')
    .eq('user_id', userId)
    .in('conversation_id', threads.map((row) => row.id))
    .order('created_at', { ascending: false })
    .limit(16);

  if (msgError) {
    console.error('Failed to load recent messages:', msgError.message);
    return '';
  }

  const byConv = new Map<string, MsgRow[]>();
  for (const msg of (msgs ?? []) as MsgRow[]) {
    const list = byConv.get(msg.conversation_id) ?? [];
    if (list.length >= 2) continue;
    list.push(msg);
    byConv.set(msg.conversation_id, list);
  }

  const lines: string[] = [];
  for (const thread of threads) {
    const recent = (byConv.get(thread.id) ?? []).slice().reverse();
    if (!recent.length) continue;
    const title = (thread.title || 'Chat').trim();
    const snippets = recent.map((msg) => {
      const who = msg.sender === 'user' ? 'Parent' : 'Taylo';
      const body = msg.body.replace(/\s+/g, ' ').trim().slice(0, 140);
      return `${who}: ${body}`;
    });
    lines.push(`${title}: ${snippets.join(' / ')}`);
  }

  return lines.join('\n');
}

type ObserveInput = {
  items: ItemRow[];
  facts: FactRow[];
  recentChat: string;
  household: Household;
  spotlight: SpotlightRow[];
  people: PersonContext[];
  lastInsight: string | null;
  capturedTitles: string[];
  actionCandidates: ReturnType<typeof noticedActionCandidates>;
};

type NoticedRow = { generated_at?: string; insight_text?: string };

async function loadLatestNoticed(supabase: SupabaseClient, userId: string): Promise<NoticedRow | null> {
  const { data } = await supabase
    .from('home_noticed')
    .select('generated_at, insight_text')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as NoticedRow | null) ?? null;
}

function cachedInsight(row: NoticedRow | null): string | null {
  const text = (row?.insight_text || '').trim();
  return text || null;
}

async function loadPeople(supabase: SupabaseClient, userId: string): Promise<PersonContext[]> {
  const viewer = await loadViewerContext(supabase, userId);
  const { data, error } = await restrictHouseholdFamilyMembers(
    supabase.from('family_members').select('id, role, first_name, birthday, school'),
    viewer,
  );

  if (error) {
    console.error('Failed to load family members:', error.message);
    return [];
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const people: PersonContext[] = [];
  for (const row of (data ?? []) as MemberRow[]) {
    const name = row.first_name?.trim();
    if (!name) continue;
    const age = ageFromBirthday(row.birthday, today);
    people.push({
      id: row.id,
      name,
      role: (row.role || 'family').trim() || 'family',
      birthday: row.birthday,
      school: row.school?.trim() || null,
      ageLabel: age?.label ?? null,
      ageMonths: age?.months ?? null,
    });
  }
  return people;
}

async function loadActionLibrary(supabase: SupabaseClient): Promise<ActionLibraryRecord[]> {
  const { data, error } = await supabase.from('action_library').select(
    'id, name, category, jurisdiction, trigger_type, window_start, window_end, window_unit, lead_window_days, check_type, action_description, source, source_url, last_verified, needs_verification, active',
  );
  if (error || !data?.length) {
    if (error) console.error('Failed to load action library:', error.message);
    return ACTION_LIBRARY_SEED;
  }
  return (data as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as ActionLibraryRecord),
    window_start: row.window_start == null ? null : Number(row.window_start),
    window_end: row.window_end == null ? null : Number(row.window_end),
    lead_window_days: Number(row.lead_window_days ?? 0),
    needs_verification: Boolean(row.needs_verification),
    active: Boolean(row.active),
  }));
}

async function materializeLibraryHolds(
  supabase: SupabaseClient,
  params: {
    userId: string;
    householdId: string | null;
    household: Household;
    children: ActionChild[];
    facts: import('../_shared/family-facts.ts').FamilyFact[];
    actions: ActionLibraryRecord[];
    today: string;
  },
): Promise<void> {
  if (!params.children.length) return;
  const names = params.children.map((child) => child.first_name);
  const [{ data: linked }, { data: events }, { data: terms }] = await Promise.all([
    supabase
      .from('items')
      .select('id, action_library_id, who_it_affects, status')
      .not('action_library_id', 'is', null)
      .in('who_it_affects', names),
    supabase
      .from('items')
      .select('kind, category, who_it_affects, occurs_at, event_date, title, status')
      .eq('kind', 'occurrence')
      .in('who_it_affects', names)
      .limit(80),
    supabase
      .from('term_dates')
      .select('id, term_name, term_start_date, application_deadline, effective_from, effective_to, jurisdiction'),
  ]);
  const drafts = materializeActionHolds({
    actions: params.actions,
    children: params.children,
    items: (linked ?? []) as LinkedActionItem[],
    facts: params.facts,
    events: (events ?? []) as CalendarOccurrence[],
    terms: (terms ?? []) as import('../_shared/action-library.ts').TermDateRecord[],
    today: params.today,
  });
  for (const draft of drafts) {
    await persistActionHolds(supabase, {
      userId: params.userId,
      householdId: params.householdId,
      visibility: defaultVisibilityForWho(draft.who_it_affects, params.household),
      drafts: [draft],
    });
  }
}

function themeForToday(todayIso: string): string {
  const day = Number(todayIso.replace(/-/g, '')) || 0;
  return MENTAL_LOAD_THEMES[day % MENTAL_LOAD_THEMES.length];
}

async function observe(apiKey: string, input: ObserveInput): Promise<string | null> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const theme = themeForToday(today);
  const raw = await callClaude(
    apiKey,
    systemPrompt(input.household, today, theme),
    userPrompt(input, today),
  );
  return parseInsight(raw, input.capturedTitles);
}

function systemPrompt(household: Household, today: string, theme: string): string {
  return `You write one short observational insight for the Home screen of Taylo, a UK family assistant. You are a warm, organised friend — light, specific, on their side.

Today (Europe/London) is ${today}.

This is NOT a to-do ranking and NOT a recap of what is already on their lists. Today's Actions and Plan already cover captured items. Your job is Taylo Noticed: the kind of thing that pops into a mum or dad's head at a random moment — the life-admin that lives in their mind, not on a calendar.

Sound like:
- "Arlo is probably due a dentist check around now — want me to add booking it to your list?"
- "Taya may be due her next clothes size if trousers are riding up."
- "Is it time to book in Arlo's 3 years 4 months jabs soon?"

Return ONLY a JSON object, nothing else:
{ "insight": "one or two short sentences" }

If you cannot name a specific person and a concrete life-admin thought, return:
{ "insight": null }

Rules for insight:
- First person as Taylo, like a text from a friend. Maximum two sentences, about 40 words. Contractions, a little warmth. No emoji. No leading sparkle mark.
- Ground it in this household: use children's names and ages. Prefer age-based UK family cadence over anything already captured as an item.
- Typical thoughts: dentist ~every 6 months; next clothes or shoe size; a routine vaccination check (never name a vaccine, dose number, or birth-cohort rule — GP/health visitor confirm); NHS health reviews; haircuts; car seat / helmet / wellies they've grown out of; nursery spare clothes; optician; birthday coming up from their date of birth.
- If age-triggered admin checks are listed in the user message, you may mention one of those. Do not invent extra clinical schedule detail.
- Frame as a gentle question or a "might be due" — never invent a booked appointment, a deadline, or that something is overdue. You do not know their last dentist visit unless a family fact says so.
- Today's theme to lean toward (unless ages strongly point elsewhere): ${theme}.
- Do not restate, reword, or summarise Today's Actions or open items. Those lists are only so you do not repeat something they already captured.
- Never "don't forget", "you need to", "urgent", "overdue", or "make sure".
- Do not invent extra children, schools, or medical conditions. Using a child's age to suspect a typical UK check or size change is allowed.
- Empty watching language is not allowed ("I'll keep an eye", "busy week"). If you cannot name the person and the thought, return null.

${householdVoiceBlock(household)}`;
}

function userPrompt(input: ObserveInput, today: string): string {
  const { items, facts, recentChat, spotlight, people, lastInsight, actionCandidates } = input;
  const already = spotlight.length
    ? spotlight.map((row) => {
        const item = items.find((entry) => entry.id === row.item_id);
        const title = item?.title || 'Untitled';
        return `- ${title}${row.reason_text ? ` — ${row.reason_text}` : ''}`;
      })
    : ['(none)'];

  const captured = items.length
    ? items.map((item) => {
        const who = item.who_it_affects ? ` who=${item.who_it_affects}` : '';
        const date = item.event_date ? ` date=${item.event_date}` : '';
        return `- ${item.title ?? 'Untitled'} (${item.category ?? 'none'}${who}${date})`;
      })
    : ['(none)'];

  const peopleLines = people.length
    ? people.map((person) => {
        const bits = [`${person.name} (${person.role})`];
        if (person.ageLabel) bits.push(`age ${person.ageLabel}`);
        if (person.birthday) bits.push(`DOB ${person.birthday}`);
        if (person.school) bits.push(person.school);
        return `- ${bits.join(' · ')}`;
      })
    : ['(none)'];

  const factLines = facts.length
    ? facts.map((row) => `- ${(row.subject || 'family').trim()}${row.category ? ` [${row.category}]` : ''}: ${row.fact.trim()}`)
    : ['(none)'];

  const actionLines = actionCandidates.length
    ? actionCandidates.map((row) => {
        const age = row.age?.label ? `age ${row.age.label}` : 'age unknown';
        return `- ${row.childName} · ${row.action.name} (${age}): ${row.action.action_description}`;
      })
    : ['(none)'];

  return `Family (use names and ages — this is the source of the thought):
${peopleLines.join('\n')}

Already on Today's Actions (do not mention these):
${already.join('\n')}

Already captured on their lists (do not suggest these as if they forgot):
${captured.join('\n')}

Family facts (use if relevant; do not invent extra medical history):
${factLines.join('\n')}

Age-triggered admin checks already identified (optional colour; do not invent vaccine names, doses, or cohort rules):
${actionLines.join('\n')}

Recent conversation snippets (optional colour only):
${recentChat.trim() || '(none)'}

Last Taylo noticed (pick a different topic):
${lastInsight || '(none)'}

Today is ${today}. Write one mental-load thought that is not already on their lists.`;
}

function parseInsight(raw: string, capturedTitles: string[]): string | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: { insight?: unknown } = {};
  try {
    parsed = JSON.parse(trimmed) as { insight?: unknown };
  } catch {
    return cleanInsight(trimmed, capturedTitles);
  }
  if (parsed.insight == null || parsed.insight === false) return null;
  return cleanInsight(parsed.insight, capturedTitles);
}

function cleanInsight(value: unknown, capturedTitles: string[]): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').replace(/^✦\s*/, '').trim();
  if (!text || text.toLowerCase() === 'null' || text.length < 24) return null;
  if (isVagueNoticed(text)) return null;
  if (!looksLikeMentalLoad(text)) return null;
  if (!vaccinationCopyIsSafe(text)) return null;
  if (insightRepeatsCaptured(text, capturedTitles)) return null;
  return text.slice(0, 280);
}

async function callClaude(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.find((block) => block.type === 'text')?.text?.trim() ?? '';
  if (!text) throw new Error('Empty Claude reply');
  return text;
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
