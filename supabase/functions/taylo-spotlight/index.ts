import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { belongsToCompletedCollection } from '../_shared/collections.ts';
import { householdVoiceBlock, loadHousehold, type Household } from '../_shared/household.ts';
import {
  HOME_OVERFLOW_RANK_BASE,
  HOME_RADAR_LOAD_KINDS,
  HOME_SURFACED_COOLDOWN_MS,
  orderHomeSpotlightQueue,
  shouldRegenerateSpotlight,
  type HomeSurfaced,
} from '../_shared/placement.ts';
import { loadViewerContext, restrictVisibleItems } from '../_shared/item-visibility.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-5';
const MAX_FACTS = 50;

type ItemRow = {
  id: string;
  title: string | null;
  body: string | null;
  detail: string | null;
  category: string | null;
  action_description: string | null;
  event_date: string | null;
  due_at: string | null;
  occurs_at: string | null;
  kind: string | null;
  confidence: string | null;
  surface_from: string | null;
  surface_until: string | null;
  parent_id: string | null;
  parent?: {
    title?: string | null;
    kind?: string | null;
    occurs_at?: string | null;
    event_date?: string | null;
    due_at?: string | null;
  } | {
    title?: string | null;
    kind?: string | null;
    occurs_at?: string | null;
    event_date?: string | null;
    due_at?: string | null;
  }[] | null;
  who_it_affects: string | null;
  urgency_level: string | null;
  source: string | null;
  created_at: string;
  collection_id: string | null;
  collections: { status: string | null; type: string | null } | { status: string | null; type: string | null }[] | null;
};

type ChecklistEntry = { text: string; done: boolean; sort_order: number };
type ChildPrepRow = {
  id: string;
  parent_id: string | null;
  title: string | null;
  status: string | null;
  created_at: string | null;
};

type FactRow = { subject: string; fact: string; category: string | null };
type ConvRow = { id: string; title: string | null; kind: string | null };
type MsgRow = { conversation_id: string; sender: string; body: string; created_at: string };

type Ranked = { item_id: string; reason_text: string };

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

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const body = await readBody(req);
    const force = Boolean(body.force);

    let userId: string | undefined;
    if (token === serviceRoleKey) {
      userId = typeof body.user_id === 'string' ? body.user_id : undefined;
      if (!userId) return json({ error: 'Missing user_id' }, 400);
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return json({ error: 'Invalid or expired session' }, 401);
      }
      userId = user.id;
    }

    if (!userId) return json({ error: 'Missing user' }, 401);

    const { data: existingRows } = await supabase
      .from('home_spotlight')
      .select('item_id, generated_at, rank')
      .eq('user_id', userId)
      .order('rank', { ascending: true });

    const cache = (existingRows ?? []) as {
      item_id: string | null;
      generated_at?: string | null;
      rank?: number | null;
    }[];
    let latestAt = '';
    for (const row of cache) {
      const at = row.generated_at || '';
      if (at > latestAt) latestAt = at;
    }
    const latest = latestAt ? cache.filter((row) => (row.generated_at || '') === latestAt) : [];
    const generatedAtRaw = latest[0]?.generated_at;
    const generatedAt = generatedAtRaw ? new Date(generatedAtRaw) : null;
    const now = new Date();
    if (!force && !shouldRegenerateSpotlight({ generatedAt, now })) {
      return json({ success: true, skipped: true, generated_at: generatedAtRaw });
    }

    const cachedHomeIds = latest
      .filter((row) => (row.rank ?? 0) < HOME_OVERFLOW_RANK_BASE)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((row) => row.item_id)
      .filter((id): id is string => !!id);
    const previouslySurfaced: HomeSurfaced[] =
      generatedAt && now.getTime() - generatedAt.getTime() < HOME_SURFACED_COOLDOWN_MS
        ? cachedHomeIds.map((id) => ({ id, at: generatedAt }))
        : [];

    const viewer = await loadViewerContext(supabase, userId);
    const { data: itemRows, error: itemsError } = await restrictVisibleItems(
      supabase
        .from('items')
        .select(
          'id, title, body, detail, category, action_description, event_date, due_at, occurs_at, kind, confidence, surface_from, surface_until, parent_id, who_it_affects, urgency_level, source, created_at, collection_id, status, collections(status, type), parent:items!parent_id(id, title, kind, status, collection_id, occurs_at, event_date, due_at)',
        ),
      viewer,
    )
      .eq('status', 'open')
      .in('kind', [...HOME_RADAR_LOAD_KINDS])
      .order('created_at', { ascending: false });

    if (itemsError) {
      console.error('Failed to load items:', itemsError.message);
      return json({ error: 'Failed to load items' }, 500);
    }

    const items = ((itemRows ?? []) as ItemRow[]).filter(
      (item) => !belongsToCompletedCollection(item.collections),
    );
    const { home, overflow } = orderHomeSpotlightQueue(items, {
      previouslySurfaced,
      today: now,
    });

    const rankable = [...home, ...overflow].map((card) => card.item);
    if (!rankable.length) {
      await supabase.from('home_spotlight').delete().eq('user_id', userId);
      return json({ success: true, spotlight: 0 });
    }

    const itemIds = rankable.map((item) => item.id);
    const [checklists, facts, recentChat, household] = await Promise.all([
      loadChecklists(supabase, itemIds),
      loadFacts(supabase, userId),
      loadRecentChat(supabase, userId),
      loadHousehold(supabase, userId),
    ]);

    let ranked: Ranked[];
    try {
      ranked = await writeReasons(anthropicKey, rankable, checklists, facts, recentChat, household);
    } catch (err) {
      console.error('Spotlight copy failed, using fallback:', err);
      ranked = fallbackRank(rankable, checklists);
    }
    const reasonById = new Map(ranked.map((entry) => [entry.item_id, entry.reason_text]));
    const generatedAtIso = new Date().toISOString();
    const rows = [
      ...home.map((card, index) => ({
        user_id: userId,
        item_id: card.item.id,
        reason_text: reasonById.get(card.item.id) || fallbackReason(card.item, checklists.get(card.item.id) ?? []),
        rank: index,
        generated_at: generatedAtIso,
      })),
      ...overflow.map((card, index) => ({
        user_id: userId,
        item_id: card.item.id,
        reason_text: reasonById.get(card.item.id) || fallbackReason(card.item, checklists.get(card.item.id) ?? []),
        rank: HOME_OVERFLOW_RANK_BASE + index,
        generated_at: generatedAtIso,
      })),
    ];

    const { error: deleteError } = await supabase
      .from('home_spotlight')
      .delete()
      .eq('user_id', userId);
    if (deleteError) {
      console.error('Failed to clear spotlight:', deleteError.message);
      return json({ error: 'Failed to save spotlight' }, 500);
    }

    if (rows.length) {
      const { error: insertError } = await supabase.from('home_spotlight').insert(rows);
      if (insertError) {
        console.error('Failed to insert spotlight:', insertError.message);
        return json({ error: 'Failed to save spotlight' }, 500);
      }
    }

    return json({
      success: true,
      skipped: false,
      generated_at: generatedAtIso,
      spotlight: rows.length,
    });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

async function readBody(req: Request): Promise<{ force?: unknown; user_id?: unknown }> {
  try {
    return (await req.json()) as { force?: unknown; user_id?: unknown };
  } catch {
    return {};
  }
}

async function loadChecklists(
  supabase: SupabaseClient,
  itemIds: string[],
): Promise<Map<string, ChecklistEntry[]>> {
  const byItem = new Map<string, ChecklistEntry[]>();
  if (!itemIds.length) return byItem;

  const { data, error } = await supabase
    .from('items')
    .select('id, parent_id, title, status, created_at, kind')
    .in('parent_id', itemIds)
    .neq('status', 'dismissed');

  if (error) {
    console.error('Failed to load prep children:', error.message);
    return byItem;
  }

  const rows = [...((data ?? []) as ChildPrepRow[])].sort((a, b) =>
    (a.created_at || '').localeCompare(b.created_at || ''),
  );
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = byItem.get(row.parent_id) ?? [];
    list.push({
      text: row.title || '',
      done: row.status === 'done',
      sort_order: list.length,
    });
    byItem.set(row.parent_id, list);
  }
  return byItem;
}

async function loadFacts(supabase: SupabaseClient, userId: string): Promise<FactRow[]> {
  const { data, error } = await supabase
    .from('family_facts')
    .select('subject, fact, category')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MAX_FACTS);

  if (error) {
    console.error('Failed to load family facts:', error.message);
    return [];
  }
  return (data ?? []) as FactRow[];
}

async function loadRecentChat(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
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

async function writeReasons(
  apiKey: string,
  items: ItemRow[],
  checklists: Map<string, ChecklistEntry[]>,
  facts: FactRow[],
  recentChat: string,
  household: Household,
): Promise<Ranked[]> {
  if (!items.length) return [];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const raw = await callClaude(
    apiKey,
    copyPrompt(household, today, items.length),
    userPrompt(items, checklists, facts, recentChat),
  );
  const parsed = parseRanked(raw, items);
  const got = new Map(parsed.map((entry) => [entry.item_id, entry.reason_text]));
  const fallback = fallbackRank(items, checklists);
  const fallbackById = new Map(fallback.map((entry) => [entry.item_id, entry.reason_text]));
  return items.map((item) => ({
    item_id: item.id,
    reason_text:
      got.get(item.id) || fallbackById.get(item.id) || fallbackReason(item, checklists.get(item.id) ?? []),
  }));
}

function copyPrompt(household: Household, today: string, count: number): string {
  return `You write short Home-screen lines for Taylo, a UK family assistant. You are a warm, organised friend — light, specific, on their side. Not a productivity app, not a nag.

Today (Europe/London) is ${today}.

Return ONLY a JSON object, nothing else:
{
  "spotlight": [{ "item_id": "uuid", "reason": "why this matters now" }]
}

Write exactly one row for every provided item (${count} total). Ranking is already decided — do not drop items, do not add extras, do not reorder. Only use item_id values from the provided list.

reason: first person as Taylo, like a text from a friend. Maximum ~15 words. Contractions, a little warmth. One specific detail — a date, a name, leftover prep, something from family context or a recent chat. No emoji.

Sound like: "If you're near a shop, carrots are still on the list." / "Sports day tomorrow — kit's not packed yet."
Not like: "This is on your list." / "You added this recently." / "This needs doing." / "Urgent: complete this task." / "I'll keep an eye on this."

Never guilt them. Never name the Home screen "Today".

${householdVoiceBlock(household)}`;
}

function userPrompt(
  items: ItemRow[],
  checklists: Map<string, ChecklistEntry[]>,
  facts: FactRow[],
  recentChat: string,
): string {
  const itemLines = items.map((item) => {
    const prep = checklists.get(item.id) ?? [];
    const prepBit = prep.length
      ? `checklist ${prep.filter((row) => row.done).length}/${prep.length} done [${prep.map((row) => `${row.text}${row.done ? '✓' : ''}`).join(', ')}]`
      : 'no checklist';
    const source = item.source ? `provenance=${item.source}` : 'provenance=none';
    const help = item.action_description?.trim()
      ? `help="${item.action_description.trim()}"`
      : 'help=none';
    return `- ${item.id} | ${item.title ?? 'Untitled'} | ${item.body ?? ''} | category=${item.category ?? 'none'} | date=${item.event_date ?? 'none'} | urgency=${item.urgency_level ?? 'none'} | who=${item.who_it_affects ?? 'none'} | ${source} | ${help} | ${prepBit}`;
  });

  const factLines = facts.length
    ? facts.map((row) => `- ${(row.subject || 'family').trim()}${row.category ? ` [${row.category}]` : ''}: ${row.fact.trim()}`)
    : ['(none)'];

  return `Open items:
${itemLines.join('\n')}

Family context:
${factLines.join('\n')}

Recent conversation snippets (lean; ignore unless genuinely relevant):
${recentChat.trim() || '(none)'}`;
}

function parseRanked(raw: string, items: ItemRow[]): Ranked[] {
  const known = new Set(items.map((item) => item.id));
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: { spotlight?: unknown } = {};
  try {
    parsed = JSON.parse(trimmed) as { spotlight?: unknown };
  } catch {
    parsed = {};
  }

  return takeRanked(parsed.spotlight, known, new Set<string>(), items.length);
}

function takeRanked(
  raw: unknown,
  known: Set<string>,
  used: Set<string>,
  limit: number,
): Ranked[] {
  if (!Array.isArray(raw)) return [];
  const out: Ranked[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as { item_id?: unknown; reason?: unknown; reason_text?: unknown };
    const id = typeof row.item_id === 'string' ? row.item_id.trim() : '';
    if (!id || !known.has(id) || used.has(id)) continue;
    const reason = cleanReason(row.reason ?? row.reason_text);
    if (!reason) continue;
    used.add(id);
    out.push({ item_id: id, reason_text: reason });
    if (out.length >= limit) break;
  }
  return out;
}

function cleanReason(value: unknown): string {
  if (typeof value !== 'string') return '';
  const reason = value.replace(/\s+/g, ' ').trim();
  if (!reason || reason.toLowerCase() === 'null') return '';
  return reason.slice(0, 160);
}

function fallbackRank(
  items: ItemRow[],
  checklists: Map<string, ChecklistEntry[]>,
): Ranked[] {
  return items.map((item) => ({
    item_id: item.id,
    reason_text: fallbackReason(item, checklists.get(item.id) ?? []),
  }));
}

function fallbackReason(item: ItemRow, prep: ChecklistEntry[]): string {
  const openPrep = prep.filter((row) => !row.done);
  if (openPrep.length && item.event_date) {
    return `Still ${openPrep.length} prep left before ${item.event_date}.`;
  }
  if (item.urgency_level === 'today') return "This one's for today — worth getting it done.";
  if (item.event_date) return `Coming up on ${item.event_date}.`;
  return item.body?.trim() || "I've kept this on your list.";
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
      max_tokens: 2500,
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
