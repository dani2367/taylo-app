import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { belongsToCompletedCollection } from '../_shared/collections.ts';
import { householdVoiceBlock, loadHousehold, type Household } from '../_shared/household.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-5';
const STALE_MS = 4 * 60 * 60 * 1000;
const MAX_SPOTLIGHT = 6;
const MAX_WATCHING = 4;
const MAX_FACTS = 50;

type ItemRow = {
  id: string;
  title: string | null;
  body: string | null;
  detail: string | null;
  category: string | null;
  action_description: string | null;
  event_date: string | null;
  who_it_affects: string | null;
  urgency_level: string | null;
  source: string | null;
  created_at: string;
  collection_id: string | null;
  collections: { status: string | null; type: string | null } | { status: string | null; type: string | null }[] | null;
};

type ChecklistEntry = { text: string; done: boolean; sort_order: number };
type ChecklistList = { item_id: string; checklist_items: ChecklistEntry[] | null };

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

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );

    if (authError || !user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    const force = await readForce(req);

    if (!force) {
      const { data: latest } = await supabase
        .from('home_spotlight')
        .select('generated_at')
        .eq('user_id', user.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const generatedAt = (latest as { generated_at?: string } | null)?.generated_at;
      if (generatedAt && Date.now() - new Date(generatedAt).getTime() < STALE_MS) {
        return json({ success: true, skipped: true, generated_at: generatedAt });
      }
    }

    const { data: itemRows, error: itemsError } = await supabase
      .from('items')
      .select(
        'id, title, body, detail, category, action_description, event_date, who_it_affects, urgency_level, source, created_at, collection_id, collections(status, type)',
      )
      .eq('user_id', user.id)
      .eq('status', 'open')
      .neq('source', 'calendar')
      .order('created_at', { ascending: false })
      .limit(40);

    if (itemsError) {
      console.error('Failed to load items:', itemsError.message);
      return json({ error: 'Failed to load items' }, 500);
    }

    const items = ((itemRows ?? []) as ItemRow[]).filter(
      (item) => !belongsToCompletedCollection(item.collections),
    );
    if (!items.length) {
      await supabase.from('home_spotlight').delete().eq('user_id', user.id);
      return json({ success: true, spotlight: 0, watching: 0 });
    }

    const itemIds = items.map((item) => item.id);
    const [checklists, facts, recentChat, household] = await Promise.all([
      loadChecklists(supabase, itemIds),
      loadFacts(supabase, user.id),
      loadRecentChat(supabase, user.id),
      loadHousehold(supabase, user.id),
    ]);

    let ranked: { spotlight: Ranked[]; watching: Ranked[] };
    try {
      ranked = await rankItems(anthropicKey, items, checklists, facts, recentChat, household);
    } catch (err) {
      console.error('Spotlight ranking failed, using fallback:', err);
      ranked = fallbackRank(items, checklists);
    }
    const generatedAt = new Date().toISOString();
    const rows = [
      ...ranked.spotlight.map((entry, index) => ({
        user_id: user.id,
        item_id: entry.item_id,
        reason_text: entry.reason_text,
        rank: index,
        is_watching: false,
        generated_at: generatedAt,
      })),
      ...ranked.watching.map((entry, index) => ({
        user_id: user.id,
        item_id: entry.item_id,
        reason_text: entry.reason_text,
        rank: index,
        is_watching: true,
        generated_at: generatedAt,
      })),
    ];

    const { error: deleteError } = await supabase
      .from('home_spotlight')
      .delete()
      .eq('user_id', user.id);
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
      generated_at: generatedAt,
      spotlight: ranked.spotlight.length,
      watching: ranked.watching.length,
    });
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

async function loadChecklists(
  supabase: SupabaseClient,
  itemIds: string[],
): Promise<Map<string, ChecklistEntry[]>> {
  const byItem = new Map<string, ChecklistEntry[]>();
  if (!itemIds.length) return byItem;

  const { data, error } = await supabase
    .from('checklists')
    .select('item_id, checklist_items(text, done, sort_order)')
    .in('item_id', itemIds);

  if (error) {
    console.error('Failed to load checklists:', error.message);
    return byItem;
  }

  for (const list of (data ?? []) as ChecklistList[]) {
    const entries = [...(list.checklist_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    if (entries.length) byItem.set(list.item_id, entries);
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

async function rankItems(
  apiKey: string,
  items: ItemRow[],
  checklists: Map<string, ChecklistEntry[]>,
  facts: FactRow[],
  recentChat: string,
  household: Household,
): Promise<{ spotlight: Ranked[]; watching: Ranked[] }> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const raw = await callClaude(apiKey, systemPrompt(household, today), userPrompt(items, checklists, facts, recentChat));
  const parsed = parseRanked(raw, items);
  if (parsed.spotlight.length || parsed.watching.length) return parsed;
  return fallbackRank(items, checklists);
}

function systemPrompt(household: Household, today: string): string {
  return `You rank a parent's open items for the Home screen of Taylo, a UK family assistant. You are a warm, organised friend — light, specific, on their side. Not a productivity app, not a nag.

Today (Europe/London) is ${today}.

Return ONLY a JSON object, nothing else:
{
  "spotlight": [{ "item_id": "uuid", "reason": "why this matters now" }],
  "watching": [{ "item_id": "uuid", "reason": "why you're keeping an eye on it" }]
}

spotlight: 4–6 items that deserve attention right now. Fewer is fine if there aren't that many genuine ones. Never more than 6.
watching: 2–4 lower-priority items that are approaching but not urgent. 0 is fine. Never more than 4.
Never put the same item in both lists. Only use item_id values from the provided list.

reason: first person as Taylo, like a text from a friend. Maximum ~15 words. Contractions, a little warmth. One specific detail — a date, a name, leftover prep, something from family context or a recent chat. A single emoji is fine if it feels natural; don't sprinkle them.

Sound like: "If you're near a shop, carrots are still on the list." / "Sports day tomorrow — kit's not packed yet." / "I'll keep an eye on the dentist one; it's not for a bit."
Not like: "This is on your list." / "You added this recently." / "This needs doing." / "Urgent: complete this task."

Never guilt them. Never name the Home screen "Today".

Choose by genuine now-ness: urgency, proximity of event_date, incomplete checklist before an event, and anything actually relevant in family context or recent conversation. Do not just pick the most recently captured items. Rank individual items only — do not invent a collection-level card.

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
    return `- ${item.id} | ${item.title ?? 'Untitled'} | ${item.body ?? ''} | category=${item.category ?? 'none'} | date=${item.event_date ?? 'none'} | urgency=${item.urgency_level ?? 'none'} | who=${item.who_it_affects ?? 'none'} | ${prepBit}`;
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

function parseRanked(raw: string, items: ItemRow[]): { spotlight: Ranked[]; watching: Ranked[] } {
  const known = new Set(items.map((item) => item.id));
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: { spotlight?: unknown; watching?: unknown } = {};
  try {
    parsed = JSON.parse(trimmed) as { spotlight?: unknown; watching?: unknown };
  } catch {
    parsed = {};
  }

  const used = new Set<string>();
  const spotlight = takeRanked(parsed.spotlight, known, used, MAX_SPOTLIGHT);
  const watching = takeRanked(parsed.watching, known, used, MAX_WATCHING);
  return { spotlight, watching };
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
): { spotlight: Ranked[]; watching: Ranked[] } {
  const urgencyScore: Record<string, number> = {
    today: 4,
    this_week: 3,
    upcoming: 2,
    none: 1,
  };
  const sorted = [...items].sort((a, b) => {
    const ua = urgencyScore[a.urgency_level ?? ''] ?? 0;
    const ub = urgencyScore[b.urgency_level ?? ''] ?? 0;
    if (ub !== ua) return ub - ua;
    return (a.event_date ?? '9999').localeCompare(b.event_date ?? '9999');
  });

  const spotlight = sorted.slice(0, Math.min(MAX_SPOTLIGHT, sorted.length)).map((item) => ({
    item_id: item.id,
    reason_text: fallbackReason(item, checklists.get(item.id) ?? []),
  }));
  const watching = sorted
    .slice(spotlight.length, spotlight.length + MAX_WATCHING)
    .map((item) => ({
      item_id: item.id,
      reason_text: fallbackReason(item, checklists.get(item.id) ?? []),
    }));
  return { spotlight, watching };
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
      max_tokens: 1200,
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
