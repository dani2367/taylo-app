import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CHECKLIST_PROMPT_RULE,
  appendChecklistItems,
  cleanGroceryProductLabel,
  insertIntakeChildren,
  looksLikeShoppingList,
  parseChecklistLabels,
} from '../_shared/checklists.ts';
import { findOrCreateShoppingListItem, findOrCreateTodoCollection } from '../_shared/collections.ts';
import { groceryLabelsFromText, isGroceryCapture, looksLikeGroceryProduct } from '../_shared/shopping.ts';
import { householdVoiceBlock, loadHousehold, type Household } from '../_shared/household.ts';
import {
  applyStandingFactsToIntake,
  factsPromptBlockForPeople,
  loadHouseholdFacts,
  parseStandingFacts,
  persistInferredFacts,
  retrieveActiveFactsForPerson,
  type FamilyFact,
  type FamilyMemberRef,
  type ProposedFact,
} from '../_shared/family-facts.ts';
import { defaultVisibilityForWho } from '../_shared/item-visibility.ts';
import { distinctSuggestion, optionalCopy } from '../_shared/item-copy.ts';
import { linkIncomingItem } from '../_shared/cross-source.ts';
import {
  eventDateFromIntake,
  finalizeSourceItems,
  intakeContractRules,
  intakeRowFields,
  splitParentAndChildren,
  type IntakeItem,
} from '../_shared/intake-contract.ts';

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
  detail: string | null;
  suggestion: string | null;
  category: Category;
  event_date: string | null;
  who_it_affects: string | null;
  urgency_level: Urgency;
  checklist_items: string[];
  items: IntakeItem[];
  standing_facts: ProposedFact[];
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
    const knowledge = await loadHouseholdFacts(supabase, { userId: user.id });
    const extracted = await extractItem(anthropicKey, userText, household, knowledge);
    const relevantFacts = retrieveActiveFactsForPerson(knowledge.facts, {
      person_name: extracted.who_it_affects,
      members: knowledge.members,
    });
    extracted.items = applyStandingFactsToIntake(extracted.items, relevantFacts);
    if (extracted.standing_facts.length) {
      await persistInferredFacts(supabase, {
        userId: user.id,
        householdId: knowledge.householdId,
        members: knowledge.members,
        existing: knowledge.facts,
        proposed: extracted.standing_facts.map((row) => ({ ...row, source: 'inferred_chat' as const })),
      });
    }
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
      const productLabels = groceryLabelsFromText(userText).filter((label) =>
        looksLikeGroceryProduct(label),
      );
      let shoppingItemId: string | null = null;
      if (productLabels.length) {
        extracted.checklist_items = productLabels;
        const saved = await saveShoppingItems(supabase, user.id, extracted);
        if (saved) {
          shoppingItemId = saved.itemId;
          reply = shoppingReply(saved.added, productLabels);
        }
      }
      extracted.items = extracted.items.filter((row) => !looksLikeGroceryProduct(row.title, extracted.category));
      const alreadyHasEvent = extracted.items.some(
        (row) => row.kind === 'occurrence' || (row.kind === 'context_only' && !!row.occurs_at),
      );
      if (
        !alreadyHasEvent &&
        hasNonGroceryTask(userText) &&
        !extracted.items.some((row) => row.kind === 'obligation')
      ) {
        const taskTitle = taskTitleFromMixedText(userText);
        if (taskTitle) {
          const work: IntakeItem = {
            title: taskTitle,
            kind: 'obligation',
            occurs_at: null,
            due_at: extracted.event_date,
            actionable: 'yes',
            prep_implied: 'stated',
            confidence: 'high',
            evidence: userText,
            surface_from: null,
            surface_until: null,
          };
          const keep = extracted.items.filter(
            (row) => row.kind === 'occurrence' || row.kind === 'context_only',
          );
          if (keep.length) {
            extracted.items = [...keep, work];
          } else {
            extracted.title = taskTitle;
            extracted.items = [work];
          }
        }
      }
      if (!extracted.items.length) {
        if (!shoppingItemId) {
          return json({ error: 'Failed to save item' }, 500);
        }
        itemId = shoppingItemId;
      } else {
      const { parent, children } = splitParentAndChildren(extracted.items, extracted.title);
      extracted.title = parent.title;
      const linked = await linkIncomingItem(supabase, user.id, {
        title: parent.title,
        kind: parent.kind,
        source: 'chat',
        who_it_affects: extracted.who_it_affects,
        occurs_at: parent.occurs_at,
        due_at: parent.due_at,
        event_date: eventDateFromIntake(parent, 'chat') ?? extracted.event_date,
        parent_id: null,
        status: 'open',
        evidence: parent.evidence,
        body: extracted.body,
        detail: extracted.detail,
        suggestion: extracted.suggestion,
        category: extracted.category,
        user_id: user.id,
        created_by: user.id,
      });
      if (linked.merged && linked.canonicalId) {
        await insertIntakeChildren(supabase, {
          userId: user.id,
          itemId: linked.canonicalId,
          items: children,
        });
        itemId = linked.canonicalId;
      } else {
      const listBound =
        parent.kind === 'occurrence' || parent.kind === 'context_only'
          ? null
          : await findOrCreateTodoCollection(supabase, user.id);
      const { data: item, error: itemError } = await supabase
        .from('items')
        .insert({
          user_id: user.id,
          collection_id: listBound,
          title: parent.title,
          body: extracted.body,
          detail: extracted.detail,
          suggestion: extracted.suggestion,
          category: extracted.category,
          icon: meta.icon,
          colour_class: meta.colour,
          status: 'open',
          source: 'chat',
          source_label: 'Added from Ask',
          event_date: eventDateFromIntake(parent, 'chat') ?? extracted.event_date,
          who_it_affects: extracted.who_it_affects,
          visibility: defaultVisibilityForWho(extracted.who_it_affects, household),
          urgency_level: extracted.urgency_level,
          ...intakeRowFields(parent),
        })
        .select('id, title')
        .single();

      if (itemError || !item) {
        console.error('Failed to insert item:', itemError?.message);
        return json({ error: 'Failed to save item' }, 500);
      }

      await insertIntakeChildren(supabase, {
        userId: user.id,
        itemId: item.id,
        items: children,
      });
      itemId = item.id;
      }
      }
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
  if (hasNonGroceryTask(userText)) return false;
  if (looksLikeShoppingList(extracted.title) || looksLikeShoppingList(userText)) return true;
  return isGroceryCapture(userText) || isGroceryCapture(extracted.title);
}

function hasNonGroceryTask(text: string): boolean {
  return /\b(email|teacher|call|text|book|sign|rsvp|form|appointment)\b/i.test(text);
}

function taskTitleFromMixedText(text: string): string | null {
  const parts = text
    .split(/\s+and\s+(?:i\s+)?(?:still\s+)?/i)
    .flatMap((part) => part.split(/\s+[-–—]\s+/))
    .map((part) => part.trim())
    .filter(Boolean);
  const task = parts.find((part) => hasNonGroceryTask(part) && !isGroceryCapture(part));
  if (!task) return null;
  const cleaned = task.replace(/^(i\s+)?(still\s+)?(need to |need |want to |gotta )/i, '').trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function productsFromBuyText(text: string): string[] {
  return groceryLabelsFromText(text).filter(Boolean);
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
        detail: extracted.detail,
        suggestion: extracted.suggestion,
      })
      .eq('id', list.itemId);
  }

  return { itemId: list.itemId, added };
}

function extractPrompt(
  household: Household,
  today: string,
  factsBlock: string,
): string {
  const facts = factsBlock.trim() ? `\n${factsBlock.trim()}\n` : '';
  return `You extract one or more items from a parent's offload message for Taylo, a UK family assistant. Return ONLY a JSON object, nothing else:
{
  "title": "short title for the parent item",
  "body": "one short subtitle for the Home card, or null",
  "detail": "one overview sentence for the expanded card, distinct from body, or null",
  "suggestion": "a distinct helpful next step, or null",
  "category": "school|medical|activity|delivery|returns|financial|errand|home",
  "event_date": "YYYY-MM-DD or null — due_at for obligations; the event day for a named occurrence",
  "who_it_affects": "family member name or 'family' or null",
  "urgency_level": "today|this_week|upcoming|none",
  "checklist_items": ["Chicken"] or null,
  "items": [ parent intake item first, then each separate obligation ],
  "standing_facts": [],
  "reply": "your confirmation message to the parent"
}

Rules
- title: the action or hold, under 8 words, like a Home list item. First letter capital. No quotes. Do not copy their sentence verbatim. Shopping/groceries: product name only ("Turmeric"), never "Buy turmeric" or "Shopping list".
- body: one clipped extra fact (who, when, why) under ~12 words. Not a repeat of the title. null if the title already says it all.
- detail: one expanded-card sentence that is not a restatement of body or title. Null if body already says everything useful.
- suggestion: only a genuine next step that is not already in detail or body. Null is valid and preferred over restating detail. Do not invent a tip.
- category: pick the best fit. Groceries and supermarket runs → errand. Bookings, accommodation, forms, calls, admin → the matching category (activity/school/home), not shopping.
- event_date / due_at: convert relative dates using today (${today}). "in three weeks" means about 21 days from today. If no date is implied, null. Never invent a deadline for a hold.
- who_it_affects: a known household name if it is about them; "Dad"/"Mum" if they said that; "family" if it is for everyone; null if it is just the parent's errand with no named person.
- urgency_level: today if it is needed now/today; this_week if this week or within the next 3 days; upcoming if a date 4–21 days out is known; none if there is no time pressure (standing errand, staple, hold). Shopping defaults to none unless they imply sooner ("for dinner tomorrow").
- Lists: only supermarket products go on the shopping list. Dated chores and admin ("book the eye test", "email the teacher", "return the form by the 19th") go on General to do. If they say a thing happens on a calendar day ("X is on 23 October", "spa day on 12 June", "on Wednesday next week"), that is an occurrence on Schedule plus any stated extra work as a child — not only weddings/birthdays. Never add a child that just restates attending ("arrive at the hospital", "need to arrive by 7:30") — that clock belongs on the event. Never treat a booking, stay, form, or arrangement as shopping because they said "need".
- standing_facts: durable family knowledge only (allergies, standing preferences, who typically handles a category). Not this message's one-off task. Empty array if none. Do not include behavioural patterns.
- reply: you are Taylo talking to them — a warm, organised friend. One short sentence, like a text, contractions, first person. Confirm you added it. Shopping: "Got it — turmeric is on your shopping list." To-dos: "Got it — that's on your to-do list." Named events: "Got it — that's on your schedule" (mention the speech/RSVP if you also captured it). Never say "Today" (that screen is called Home). Never say "saved" or "got your message".
${CHECKLIST_PROMPT_RULE}

${intakeContractRules('chat')}
${facts}
${householdVoiceBlock(household)}`;
}

async function extractItem(
  apiKey: string,
  userText: string,
  household: Household,
  knowledge: { facts: FamilyFact[]; members: FamilyMemberRef[] },
): Promise<Extracted> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const raw = await callClaude(
    apiKey,
    extractPrompt(household, today, factsPromptBlockForPeople(knowledge.facts, knowledge.members)),
    userText,
    1200,
  );
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
  const detail = distinctSuggestion(optionalCopy(parsed.detail), body, title);
  const suggestion = distinctSuggestion(optionalCopy(parsed.suggestion), detail, body, title);
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
  const items = finalizeSourceItems({
    source: 'chat',
    sourceText: fallbackText,
    fallbackTitle: title,
    date: event_date,
    rawItems: (parsed as { items?: unknown }).items,
    extraLabels: checklist_items,
  });
  const standing_facts = parseStandingFacts((parsed as { standing_facts?: unknown }).standing_facts);

  return { title, body, detail, suggestion, category, event_date, who_it_affects, urgency_level, checklist_items, items, standing_facts, reply };
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
  return `Got it — ${title} is on your to-do list.`;
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
