import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5';
const STALE_MS = 4 * 60 * 60 * 1000;

type PersonIn = { id?: unknown; name?: unknown; titles?: unknown };

type Body = {
  force?: unknown;
  week_start?: unknown;
  fingerprint?: unknown;
  people?: unknown;
};

const memory = new Map<string, { summaries: Record<string, string>; generatedAt: number; fingerprint: string }>();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json(null, 204);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!anthropicKey || !supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Server misconfiguration' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return json({ error: 'Invalid or expired session' }, 401);

    const payload = await readBody(req);
    const people = parsePeople(payload.people);
    const weekStart = typeof payload.week_start === 'string' ? payload.week_start.trim() : '';
    const fingerprint = typeof payload.fingerprint === 'string' ? payload.fingerprint.trim() : '';
    const force = Boolean(payload.force);
    if (!people.length || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !fingerprint) {
      return json({ error: 'Invalid family-week payload' }, 400);
    }

    const cacheKey = `${user.id}:${fingerprint}`;
    const cached = memory.get(cacheKey);
    if (!force && cached && cached.fingerprint === fingerprint && Date.now() - cached.generatedAt < STALE_MS) {
      return json({ success: true, skipped: true, summaries: cached.summaries });
    }

    const summaries = fallbackAll(people);
    const withItems = people.filter((person) => person.titles.length > 0);
    if (withItems.length) {
      try {
        const generated = await writeLines(anthropicKey, withItems);
        for (const [id, line] of Object.entries(generated)) {
          if (line) summaries[id] = line;
        }
      } catch (err) {
        console.error('Family week generation failed:', err);
      }
    }

    memory.set(cacheKey, { summaries, fingerprint, generatedAt: Date.now() });
    return json({ success: true, skipped: false, summaries });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

async function readBody(req: Request): Promise<Body> {
  try {
    return (await req.json()) as Body;
  } catch {
    return {};
  }
}

function parsePeople(raw: unknown): { id: string; name: string; titles: string[] }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const row = entry as PersonIn;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const titles = Array.isArray(row.titles)
        ? row.titles
            .filter((title): title is string => typeof title === 'string' && !!title.trim())
            .map((title) => title.trim())
            .slice(0, 8)
        : [];
      return { id, name, titles };
    })
    .filter((row) => row.id && row.name);
}

function fallbackLine(name: string, titles: string[]): string {
  if (!titles.length) return `${name}'s week looks quiet so far.`;
  const a = titles[0].toLowerCase().replace(/[.!?]+$/, '');
  if (titles.length === 1) return `${name}'s week is mostly ${a}.`;
  const b = titles[1].toLowerCase().replace(/[.!?]+$/, '');
  return `${name}'s week is mostly ${a} and ${b}.`;
}

function fallbackAll(people: { id: string; name: string; titles: string[] }[]): Record<string, string> {
  const summaries: Record<string, string> = {};
  for (const person of people) summaries[person.id] = fallbackLine(person.name, person.titles);
  return summaries;
}

async function writeLines(
  apiKey: string,
  people: { id: string; name: string; titles: string[] }[],
): Promise<Record<string, string>> {
  const brief = people
    .map((person) => `${person.id} | ${person.name}:\n${person.titles.map((title) => `- ${title}`).join('\n')}`)
    .join('\n\n');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system: `You write one-line weekly observations for Taylo, a UK family assistant. British English. Warm, specific, observational, never nagging.
Return ONLY JSON: { "summaries": { "<id>": "one sentence" } }
Rules for each person:
- Use ONLY that person's listed items. Never mention another person's items.
- Sound like: "Arlo's week is mostly football and the sleepover."
- One short sentence, about 12–18 words. Name the person. No emoji. No "don't forget". No exclamation marks.
- Never invent extra events or people. If their list is empty, say their week looks quiet.`,
      messages: [{ role: 'user', content: `Write one line per person for this week.\n\n${brief}` }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = data.content?.find((block) => block.type === 'text')?.text?.trim() ?? '';
  return parseSummaries(text);
}

function parseSummaries(raw: string): Record<string, string> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: { summaries?: unknown } = {};
  try {
    parsed = JSON.parse(trimmed) as { summaries?: unknown };
  } catch {
    return {};
  }
  if (!parsed.summaries || typeof parsed.summaries !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(parsed.summaries as Record<string, unknown>)) {
    const cleaned = cleanInsight(value);
    if (cleaned) out[id] = cleaned;
  }
  return out;
}

function cleanInsight(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').replace(/^✦\s*/, '').trim();
  if (!text || text.length < 12) return null;
  return text.slice(0, 160);
}

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
