import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-5';

type Body = {
  force?: unknown;
  weekday?: unknown;
  titles?: unknown;
  busy_date?: unknown;
  fingerprint?: unknown;
};

const memory = new Map<string, { insight: string; generatedAt: number; fingerprint: string }>();
const STALE_MS = 4 * 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return json(null, 204);
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

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
    const weekday = typeof payload.weekday === 'string' ? payload.weekday.trim() : '';
    const titles = Array.isArray(payload.titles)
      ? payload.titles
          .filter((title): title is string => typeof title === 'string' && !!title.trim())
          .map((title) => title.trim())
          .slice(0, 8)
      : [];
    const busyDate = typeof payload.busy_date === 'string' ? payload.busy_date.trim() : '';
    const fingerprint = typeof payload.fingerprint === 'string' ? payload.fingerprint.trim() : '';
    const force = Boolean(payload.force);

    if (!weekday || titles.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(busyDate) || !fingerprint) {
      return json({ error: 'Invalid density payload' }, 400);
    }

    const cacheKey = `${user.id}:${fingerprint}`;
    const cached = memory.get(cacheKey);
    if (
      !force &&
      cached &&
      cached.fingerprint === fingerprint &&
      Date.now() - cached.generatedAt < STALE_MS
    ) {
      return json({ success: true, skipped: true, insight: cached.insight });
    }

    let insight = fallbackLine(weekday, titles);
    try {
      const generated = await writeLine(anthropicKey, weekday, titles);
      if (generated) insight = generated;
    } catch (err) {
      console.error('Schedule density generation failed:', err);
    }

    memory.set(cacheKey, { insight, fingerprint, generatedAt: Date.now() });
    return json({ success: true, skipped: false, insight });
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

function fallbackLine(weekday: string, titles: string[]): string {
  const shown = titles.slice(0, 3);
  let things = shown[0];
  if (shown.length === 2) things = `${shown[0]} and ${shown[1]}`;
  if (shown.length >= 3) things = `${shown[0]}, ${shown[1]} and ${shown[2]}`;
  return `${weekday} is tight — ${things}`;
}

async function writeLine(apiKey: string, weekday: string, titles: string[]): Promise<string | null> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 120,
      output_config: { effort: 'low' },
      system: `You write one short observation for Taylo, a UK family assistant. British English. Warm, specific, never nagging.
Return ONLY JSON: { "insight": "one sentence" }
The sentence should sound like: "Thursday is tight — Taya has the dentist and the school trip form is due"
Rules: one sentence, about 20 words. Name the weekday. Mention the actual items. No emoji. No "don't forget". Never invent extra events or people.`,
      messages: [
        {
          role: 'user',
          content: `${weekday} has these items:\n${titles.map((title) => `- ${title}`).join('\n')}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = data.content?.find((block) => block.type === 'text')?.text?.trim() ?? '';
  return parseInsight(text);
}

function parseInsight(raw: string): string | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: { insight?: unknown } = {};
  try {
    parsed = JSON.parse(trimmed) as { insight?: unknown };
  } catch {
    return cleanInsight(trimmed);
  }
  return cleanInsight(parsed.insight);
}

function cleanInsight(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').replace(/^✦\s*/, '').trim();
  if (!text || text.length < 16) return null;
  return text.slice(0, 180);
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
