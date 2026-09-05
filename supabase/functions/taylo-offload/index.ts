import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CHECKLIST_PROMPT_RULE,
  appendChecklistItems,
  cleanGroceryProductLabel,
  insertPrepChecklist,
  looksLikeShoppingList,
  parseChecklistLabels,
} from '../_shared/checklists.ts';
import { findOrCreateShoppingListItem } from '../_shared/collections.ts';
import { householdVoiceBlock, loadHousehold, type Household } from '../_shared/household.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5';

const CATEGORIES = [
  'school',
  'medical',
  'activity',
  'delivery',
  'returns',
  'financial',
  'errand',
  'home',
] as const;

const URGENCIES = ['today', 'this_week', 'upcoming', 'none'] as const;

const CATEGORY_META: Record<string, { icon: string; colour: string }> = {
  school: { icon: 'school-outline', colour: 'blue' },
  medical: { icon: 'medkit-outline', colour: 'teal' },
  activity: { icon: 'bicycle-outline', colour: 'purple' },
  delivery: { icon: 'cube-outline', colour: 'amber' },
  returns: { icon: 'swap-horizontal-outline', colour: 'rose' },
  financial: { icon: 'card-outline', colour: 'green' },
  errand: { icon: 'cart-outline', colour: 'amber' },
  home: { icon: 'home-outline', colour: 'rose' },
};

type Category = (typeof CATEGORIES)[number];
type Urgency = (typeof URGENCIES)[number];

type Extracted = {
  title: string;
  body: string | null;
  category: Category;
  event_date: string | null;
  who_it_affects: string | null;
  urgency_level: Urgency;
  checklist_items: string[];
  reply: string;
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

    const body = await req.json() as { conversation_id?: string };
    const conversationId = body.conversation_id;
    if (!conversationId) {
      return json({ error: 'Missing conversation_id' }, 400);
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, user_id, kind, intent, title, subtitle')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (convError) {
      console.error('Failed to load conversation:', convError.message);
      return json({ error: 'Failed to load conversation' }, 500);
    }

    if (!conversation) {
      return json({ error: 'Conversation not found' }, 404);
    }

    if (conversation.kind !== 'general') {
      return json({ error: 'Offload is only for general Ask threads' }, 400);
    }

    const { data: history, error: historyError } = await supabase
      .from('messages')
      .select('sender, body')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (historyError) {
      console.error('Failed to load messages:', historyError.message);
      return json({ error: 'Failed to load messages' }, 500);
    }

    const last = (history ?? [])[0] as { sender?: string; body?: string } | undefined;
    if (!last || last.sender !== 'user' || !last.body?.trim()) {
      return json({ error: 'No user message to capture' }, 400);
    }

    const userText = last.body.trim();
    const household = await loadHousehold(supabase, user.id);
    const extracted = await extractItem(anthropicKey, userText, household);
    const grocery = isGroceryOffload(userText, extracted);
    if (grocery) {
      const originalTitle = extracted.title;
      const fromModel = parseChecklistLabels(
        extracted.checklist_items.map((label) => cleanGroceryProductLabel(label)),
      ).filter(Boolean);
      const fromUser = productsFromBuyText(userText);
      extracted.checklist_items = fromModel.length ? fromModel : fromUser;
      if (!extracted.checklist_items.length) {
        const leftover = cleanGroceryProductLabel(originalTitle);
        if (leftover && !looksLikeShoppingList(leftover)) {
          extracted.checklist_items = [leftover];
        }
      }
      extracted.category = 'errand';
      extracted.urgency_level = shoppingUrgency(extracted);
    }
    const meta = CATEGORY_META[extracted.category] ?? CATEGORY_META.errand;

    let itemId: string;
    let reply = extracted.reply;

    if (grocery) {
      const saved = await saveShoppingItems(supabase, user.id, extracted);
      if (!saved) {
        return json({ error: 'Failed to save item' }, 500);
      }
      itemId = saved.itemId;
      reply = shoppingReply(saved.added, extracted.checklist_items);
    } else {
      const { data: item, error: itemError } = await supabase
        .from('items')
        .insert({
          user_id: user.id,
          title: extracted.title,
          body: extracted.body,
          detail: extracted.body,
          suggestion: extracted.title
            ? `I can help you get “${extracted.title}” moving — ask me for the next concrete step.`
            : null,
          category: extracted.category,
          icon: meta.icon,
          colour_class: meta.colour,
          status: 'open',
          source: 'chat',
          source_label: 'Added from Ask',
          event_date: extracted.event_date,
          who_it_affects: extracted.who_it_affects,
          urgency_level: extracted.urgency_level,
          action_description: extracted.title,
        })
        .select('id, title')
        .single();

      if (itemError || !item) {
        console.error('Failed to insert item:', itemError?.message);
        return json({ error: 'Failed to save item' }, 500);
      }

      await insertPrepChecklist(supabase, {
        userId: user.id,
        itemId: item.id,
        itemTitle: item.title,
        labels: extracted.checklist_items,
      });
      itemId = item.id;
    }
    const nextTitle = titleFromUserText(userText);

    const { data: inserted, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        sender: 'taylo',
        body: reply,
        has_email_card: false,
      })
      .select('id, body')
      .single();

    if (insertError || !inserted) {
      console.error('Failed to store reply:', insertError?.message);
      return json({ error: 'Failed to store reply' }, 500);
    }

    const placeholder =
      !conversation.title ||
      conversation.title === 'Taylo' ||
      conversation.title === 'New chat' ||
      conversation.subtitle === 'New chat' ||
      conversation.subtitle === 'Offload' ||
      conversation.subtitle === 'Offload or Ask';

    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
        intent: 'offload',
        ...(placeholder ? { title: nextTitle, subtitle: 'Taylo' } : {}),
      })
      .eq('id', conversationId)
      .eq('user_id', user.id);

    return json({
      success: true,
      reply: inserted.body,
      message_id: inserted.id,
      title: placeholder ? nextTitle : conversation.title,
      item_id: itemId,
    });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function shoppingReply(added: string[], requested: string[]): string {
  if (!added.length) {
    const already = requested[0]?.toLowerCase() || 'that';
    return `That's already on your shopping list.`;
  }
  if (added.length === 1) return `Got it — ${added[0].toLowerCase()} is on your shopping list.`;
  if (added.length === 2) {
    return `Got it — ${added[0].toLowerCase()} and ${added[1].toLowerCase()} are on your shopping list.`;
  }
  return `Got it — I've added those to your shopping list.`;
}

function isGroceryOffload(userText: string, extracted: Extracted): boolean {
  const blob = `${extracted.title} ${userText}`;
  if (looksLikeShoppingList(extracted.title) || looksLikeShoppingList(userText)) return true;
  if (/\b(present|gift|birthday|party)\b/i.test(blob)) return false;
  if (/\b(?:need to |need |gotta |have to |must )?(?:buy|pick\s*up)\b/i.test(userText)) return true;
  if (/\bneed to\b/i.test(userText) ||
    /\b(appointment|dentist|doctor|teacher|email|call|book|haircut|babysitter)\b/i.test(userText)) {
    return false;
  }
  return /\b(?:i\s+)?(?:need|want|get|grab)\s+(?:some\s+|a\s+|an\s+)?(?!to\b|help\b)/i.test(userText);
}

function productsFromBuyText(text: string): string[] {
  const match = text.match(/(?:buy|pick\s*up|get|grab)\s+(?:some\s+)?(.+)/i) ||
    text.match(/\bneed\s+(?:some\s+)?(?!to\b)(.+)/i);
  const chunk = (match?.[1] || text).replace(/[.!?]+$/, '').replace(/\s+for\s+.+$/i, '').trim();
  return parseChecklistLabels(
    chunk.split(/\s*(?:,|&| and )\s*/i).map((part) => cleanGroceryProductLabel(part)),
  ).filter(Boolean);
}

function shoppingUrgency(extracted: Extracted): Urgency {
  if (extracted.urgency_level === 'today' || extracted.urgency_level === 'this_week') {
    return extracted.urgency_level;
  }
  if (extracted.event_date) {
    const today = new Date();
    const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(extracted.event_date);
    if (match) {
      const event = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      const days = Math.round((event - start) / 86400000);
      if (days <= 3) return days <= 0 ? 'today' : 'this_week';
      if (days <= 21) return 'upcoming';
    }
    return extracted.urgency_level === 'upcoming' ? 'upcoming' : 'none';
  }
  return 'none';
}

async function saveShoppingItems(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  extracted: Extracted,
): Promise<{ itemId: string; added: string[] } | null> {
  const list = await findOrCreateShoppingListItem(supabase, userId);
  if (!list) return null;

  const labels = extracted.checklist_items.length
    ? extracted.checklist_items
    : [extracted.title || 'Shopping'].filter((label) => !looksLikeShoppingList(label));

  if (!labels.length) return { itemId: list.itemId, added: [] };

  const added = await appendChecklistItems(supabase, {
    userId,
    itemId: list.itemId,
    itemTitle: list.title,
    labels,
  });

  if (extracted.event_date || extracted.urgency_level !== 'none') {
    await supabase
      .from('items')
      .update({
        event_date: extracted.event_date,
        urgency_level: extracted.urgency_level,
        body: extracted.body,
        detail: extracted.body,
      })
      .eq('id', list.itemId);
  }

  return { itemId: list.itemId, added };
}

function extractPrompt(household: Household, today: string): string {
  return `You extract a single to-do from a parent's offload message for Taylo, a UK family assistant. Return ONLY a JSON object, nothing else:
{
  "title": "short title for the item",
  "body": "one short subtitle for the Home card, or null",
  "category": "school|medical|activity|delivery|returns|financial|errand|home",
  "event_date": "YYYY-MM-DD or null",
  "who_it_affects": "family member name or 'family' or null",
  "urgency_level": "today|this_week|upcoming|none",
  "checklist_items": ["Present", "Card"] or null,
  "reply": "your confirmation message to the parent"
}

Rules
- title: the action, under 8 words, like a Home list item. First letter capital. No quotes. Do not copy their sentence verbatim — rewrite it as the thing to do. Shopping/groceries: product name only ("Turmeric"), never "Buy turmeric" or "Shopping list".
- body: one clipped extra fact (who, when, why) under ~12 words. Not a repeat of the title. null if the title already says it all.
- category: pick the best fit. Groceries, shopping, "I need some X", "need to get X", household staples → errand. Birthdays/gifts for a person → errand unless it is clearly a party (activity).
- event_date: convert relative dates using today (${today}). "in three weeks" means about 21 days from today. If no date is implied, null.
- who_it_affects: a known household name if it is about them; "Dad"/"Mum" if they said that; "family" if it is for everyone; null if it is just the parent's errand with no named person.
- urgency_level: today if it is needed now/today; this_week if this week or within the next 3 days; upcoming if a date 4–21 days out is known; none if there is no time pressure (standing errand, staple to pick up). Shopping defaults to none unless they imply sooner ("for dinner tomorrow").
- reply: you are Taylo talking to them — a warm, organised friend. One short sentence, like a text, contractions, first person. Confirm you added it. For shopping, mention the item went on the list ("Got it — turmeric is on your shopping list."). Never say "Today" (that screen is called Home). Never say "saved" or "got your message".
${CHECKLIST_PROMPT_RULE}

${householdVoiceBlock(household)}`;
}

async function extractItem(
  apiKey: string,
  userText: string,
  household: Household,
): Promise<Extracted> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const raw = await callClaude(apiKey, extractPrompt(household, today), userText, 640);
  return parseExtracted(raw, userText);
}

function parseExtracted(raw: string, fallbackText: string): Extracted {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: Partial<Extracted> = {};
  try {
    parsed = JSON.parse(trimmed) as Partial<Extracted>;
  } catch {
    parsed = {};
  }

  const title = cleanTitle(typeof parsed.title === 'string' ? parsed.title : '') ||
    titleFromUserText(fallbackText);
  const body = cleanBody(parsed.body);
  const category = CATEGORIES.includes(parsed.category as Category)
    ? (parsed.category as Category)
    : 'errand';
  const event_date = validDate(parsed.event_date);
  const who_it_affects = cleanWho(parsed.who_it_affects);
  const urgency_level = URGENCIES.includes(parsed.urgency_level as Urgency)
    ? (parsed.urgency_level as Urgency)
    : event_date
      ? 'upcoming'
      : 'none';
  const reply = cleanReply(parsed.reply, title);
  const checklist_items = parseChecklistLabels(parsed.checklist_items);

  return { title, body, category, event_date, who_it_affects, urgency_level, checklist_items, reply };
}

function cleanTitle(value: string): string {
  const title = value.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
  if (!title) return '';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function cleanWho(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const who = value.replace(/\s+/g, ' ').trim();
  if (!who || who.toLowerCase() === 'null') return null;
  return who.slice(0, 80);
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function cleanBody(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const body = value.replace(/\s+/g, ' ').trim();
  if (!body || body.toLowerCase() === 'null') return null;
  return body.slice(0, 160);
}

function cleanReply(value: unknown, title: string): string {
  if (typeof value === 'string') {
    const reply = value.replace(/\s+/g, ' ').trim();
    if (reply) return reply;
  }
  return `Got it — I've added ${title} to your list.`;
}

function titleFromUserText(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean).slice(0, 6);
  let title = words.join(' ');
  if (title.length > 36) title = `${title.slice(0, 34).trim()}…`;
  if (!title) return 'To-do';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

async function callClaude(
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
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
  if (!text) {
    throw new Error('Empty Claude reply');
  }
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
