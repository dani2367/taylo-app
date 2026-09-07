import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { householdVoiceBlock, loadHousehold, type Household } from '../_shared/household.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-5';
const STALE_MS = 4 * 60 * 60 * 1000;
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
  source_email_subject: string | null;
  created_at: string;
  collections: { status: string | null } | { status: string | null }[] | null;
};

type FactRow = { subject: string; fact: string; category: string | null };
type ConvRow = { id: string; title: string | null; kind: string | null };
type MsgRow = { conversation_id: string; sender: string; body: string; created_at: string };
type SpotlightRow = { item_id: string | null; reason_text: string | null };

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
        .from('home_noticed')
        .select('generated_at, insight_text')
        .eq('user_id', user.id)
        .maybeSingle();

      const latestRow = latest as { generated_at?: string; insight_text?: string } | null;
      const generatedAt = latestRow?.generated_at;
      const cached = (latestRow?.insight_text || '').trim();
      if (
        generatedAt &&
        Date.now() - new Date(generatedAt).getTime() < STALE_MS &&
        cached &&
        !isVagueNoticed(cached)
      ) {
        return json({ success: true, skipped: true, generated_at: generatedAt });
      }
    }

    const { data: itemRows, error: itemsError } = await supabase
      .from('items')
      .select(
        'id, title, body, detail, category, action_description, event_date, who_it_affects, urgency_level, source, source_email_subject, created_at, collections(status)',
      )
      .eq('user_id', user.id)
      .eq('status', 'open')
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (itemsError) {
      console.error('Failed to load items:', itemsError.message);
      return json({ error: 'Failed to load items' }, 500);
    }

    const items = ((itemRows ?? []) as ItemRow[]).filter((item) => isActiveCollection(item.collections));

    const [facts, recentChat, household, spotlight] = await Promise.all([
      loadFacts(supabase, user.id),
      loadRecentChat(supabase, user.id),
      loadHousehold(supabase, user.id),
      loadSpotlight(supabase, user.id),
    ]);

    let insight: string | null = null;
    try {
      insight = await observe(anthropicKey, items, facts, recentChat, household, spotlight);
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
    .order('rank', { ascending: true })
    .limit(6);

  if (error) {
    console.error('Failed to load spotlight:', error.message);
    return [];
  }
  return (data ?? []) as SpotlightRow[];
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

async function observe(
  apiKey: string,
  items: ItemRow[],
  facts: FactRow[],
  recentChat: string,
  household: Household,
  spotlight: SpotlightRow[],
): Promise<string | null> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const raw = await callClaude(apiKey, systemPrompt(household, today), userPrompt(items, facts, recentChat, spotlight));
  return parseInsight(raw);
}

function systemPrompt(household: Household, today: string): string {
  return `You write one short observational insight for the Home screen of Taylo, a UK family assistant. You are a warm, organised friend — light, specific, on their side.

Today (Europe/London) is ${today}.

This is NOT a to-do ranking. Today's Actions already lists what needs doing right now. Your job is Taylo Noticed: one helpful heads-up — relevance from the week ahead, a suspected next step, a useful connection, or a specific offer of help.

Return ONLY a JSON object, nothing else:
{ "insight": "one or two short sentences" }

If nothing is genuinely useful — or you would only be restating Today's Actions — return:
{ "insight": null }

Rules for insight:
- First person as Taylo, like a text from a friend. Maximum two sentences, about 40 words. Contractions, a little warmth. No emoji. No leading sparkle mark.
- A calendar heads-up is on-brief when it is not already on Today's Actions: name what is coming (this weekend, Tuesday), suspect the likely prep (kit, present, form, snacks), and put it on their radar. Sound like: "Sports day is Saturday — I suspect you'll want kit, a water bottle, and a snack. Just putting it on your radar." / "If you've got the photos, I can talk you through the passport form tonight."
- Prefer an upcoming family event (source=calendar, or a dated school/medical/activity item) that is not already listed under Today's Actions. Skip standups, commute, generic meetings, and regular lessons.
- Make it suggestive, not a nag: a concrete suspected step or an offer. Never "don't forget", "you need to", "urgent", "overdue", or "make sure".
- Do not restate, reword, or summarise items already listed under Today's Actions.
- Prefer a connection when you have one: a family fact plus an event, something implied by a recent chat, a detail from an email that is not already the action.
- Never invent facts, people, dates, or commitments that are not in the context.
- Empty watching language with no event and no suspected step is not allowed ("I'll keep an eye", "busy week"). If you cannot name the thing and the help, return null.

${householdVoiceBlock(household)}`;
}

function userPrompt(
  items: ItemRow[],
  facts: FactRow[],
  recentChat: string,
  spotlight: SpotlightRow[],
): string {
  const already = spotlight.length
    ? spotlight.map((row) => {
        const item = items.find((entry) => entry.id === row.item_id);
        const title = item?.title || 'Untitled';
        return `- ${title}${row.reason_text ? ` — ${row.reason_text}` : ''}`;
      })
    : ['(none yet)'];

  const itemLines = items.length
    ? items.map((item) => {
        const email = item.source_email_subject ? `email="${item.source_email_subject}"` : 'email=none';
        const source = item.source ? `source=${item.source}` : 'source=none';
        const help = item.action_description?.trim()
          ? `help="${item.action_description.trim()}"`
          : 'help=none';
        return `- ${item.id} | ${item.title ?? 'Untitled'} | ${item.body ?? ''} | category=${item.category ?? 'none'} | date=${item.event_date ?? 'none'} | urgency=${item.urgency_level ?? 'none'} | who=${item.who_it_affects ?? 'none'} | ${source} | ${help} | ${email}`;
      })
    : ['(none)'];

  const factLines = facts.length
    ? facts.map((row) => `- ${(row.subject || 'family').trim()}${row.category ? ` [${row.category}]` : ''}: ${row.fact.trim()}`)
    : ['(none)'];

  return `Already on Today's Actions (do not restate these):
${already.join('\n')}

Open items (including undated):
${itemLines.join('\n')}

Family facts:
${factLines.join('\n')}

Recent conversation snippets:
${recentChat.trim() || '(none)'}`;
}

function isVagueNoticed(text: string): boolean {
  if (/busy (week|day)|nothing (much )?to (report|flag)|all (looks )?good|here's what|today's actions/i.test(text)) {
    return true;
  }
  const watching = /keep(ing)? (an )?eye|worth (keeping|watching)/i.test(text);
  const specific =
    /\b(saturday|sunday|weekend|monday|tuesday|wednesday|thursday|friday|pack|kit|present|form|snack|appointment|birthday|party|trip|school)\b/i.test(
      text,
    );
  if (watching && !specific) return true;
  if (/on the radar/i.test(text) && !specific) return true;
  return false;
}

function parseInsight(raw: string): string | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: { insight?: unknown } = {};
  try {
    parsed = JSON.parse(trimmed) as { insight?: unknown };
  } catch {
    return cleanInsight(trimmed);
  }
  if (parsed.insight == null || parsed.insight === false) return null;
  return cleanInsight(parsed.insight);
}

function cleanInsight(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').replace(/^✦\s*/, '').trim();
  if (!text || text.toLowerCase() === 'null' || text.length < 24) return null;
  if (isVagueNoticed(text)) return null;
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
