import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { householdVoiceBlock, loadHousehold, whoForPrompt, type Household } from '../_shared/household.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5';

const TAYLO_SYSTEM_PROMPT = `You are Taylo, a family assistant in a UK household app. You chat like a calm, capable friend — organised, specific, never alarmed. No corporate tone.

Always address the user directly as "you". Never refer to the user by their own name in the third person.

When something is about a child or partner, use that person's name. "Arlo's school trip" is correct; "Dani's checkup" is not if Dani is the person you are talking to.

You are always Taylo (assistant). Messages with role "user" are always the parent talking to you. If a user message sounds like something you would say, they tapped a suggested prompt — still treat it as a request TO you, and answer as Taylo. Never reply as if you were the parent.

How you sound
- Calm and observational. Matter-of-fact, not urgent. Never "don't forget", "you need to", "make sure", or exclamation-driven phrasing.
- Plain English, contractions, a little warmth.
- Don't use emoji. The app has its own icons.
- You're on their side. Never lecturing, never "as an AI".

Not like this: "Don't forget Arlo's birthday!" / "You need to buy a birthday card!" / "Urgent: pack the sports kit."

What you know
- If this thread is about an item, you get a brief: title, body, detail, dates, who it affects, related prep, and the original email if there is one. Treat that as ground truth. Use it — don't wait to be reminded.
- You may also get the source email body. Use it to answer follow-up questions. If a detail still isn't there, say so — don't invent it.
- If this is a general chat (no item), only use this thread, household names, and any known family facts you are given. Don't invent extra kids or appointments.

What you don't do
- Don't give medical, legal, or financial advice. You can help them remember, reply, pack, or chase — not diagnose or decide for them.
- Don't invent facts, deadlines, shops, or "I'll email the school / GP for you". You can't send email or change their calendar yet. If they want a reminder or a draft reply, offer the words they can copy.
- Don't guilt them. Family admin is a lot.

How you help
- Answer what they asked. If they want ideas, drafts, packing lists, or options, actually give them — a short useful handful, specific to this household and this item.
- A few short sentences is fine. Use a short list when they asked for options. Don't pad, and don't collapse a real request into a one-line nudge.
- If you're unsure, ask one clear question instead of guessing.`;

const OPENER_STYLE = `This turn is the opener only — one short plain sentence (~15 words), observational, like a text from a friend. No urgency, no "don't forget", no exclamation marks. Start with a specific, useful observation or question. Address the parent as you. Use a child's name if the item is about that child.

Sound like this:
- "Arlo's birthday is Saturday. You might want to pick up a card."
- "Sports day is Thursday. Kit is still on the list if you want to pack tonight."
- "The dentist is booked for the 19th. Nothing needed until then."`;

const OPENER_USER_PROMPT = `The parent just opened this chat about the item in your brief. Return ONLY a JSON object, nothing else:
{
  "reply": "your first message",
  "chips": [{ "label": "short button", "msg": "what the parent will send you if they tap it" }]
}

reply: follow the opener style — one short plain sentence.

chips: 0 to 3 suggested questions THE PARENT would tap to ask YOU. Only include a chip if it would actually help with THIS item — e.g. draft a reply, what to pack, when the deadline is, gift ideas for a birthday. Label max ~5 words.

msg MUST be written in the parent's voice, as a request to Taylo. First person or a direct ask, specific to this item.
Good: "Give me gift ideas for Arlo's birthday" / "Can you draft a reply to the school?" / "What should I pack for sports day?"
Bad: "Here are some gift ideas" / "You might want to pick up a card" / "I can suggest a few options" — never write msg as Taylo speaking.

Do NOT include generic chips ("what's the plan", "remind me", "what else this week", "dinner ideas"). If nothing useful, use [].`;

type ConversationRow = {
  id: string;
  user_id: string;
  kind: 'general' | 'item';
  related_item_id: string | null;
  title: string;
  subtitle: string | null;
};

type MessageRow = {
  sender: 'user' | 'taylo' | 'sys';
  body: string;
};

type FamilyFactRow = {
  subject: string;
  fact: string;
  category: string | null;
};

type ItemRow = {
  title: string | null;
  body: string | null;
  detail: string | null;
  suggestion: string | null;
  category: string | null;
  action_description: string | null;
  event_date: string | null;
  due_at: string | null;
  occurs_at: string | null;
  who_it_affects: string | null;
  urgency_level: string | null;
  source: string | null;
  kind: string | null;
  evidence: string | null;
  source_email_subject: string | null;
  source_email_sender: string | null;
};

type RelatedRow = {
  title: string | null;
  kind: string | null;
  prep_origin: string | null;
  status: string | null;
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

    const body = await req.json() as { conversation_id?: string; opener?: boolean };
    const conversationId = body.conversation_id;
    const opener = Boolean(body.opener);
    if (!conversationId) {
      return json({ error: 'Missing conversation_id' }, 400);
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, user_id, kind, related_item_id, title, subtitle')
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

    const conv = conversation as ConversationRow;

    const [household, familyFacts] = await Promise.all([
      loadHousehold(supabase, user.id),
      loadFamilyFacts(supabase, user.id),
    ]);

    let nudge: ItemRow | null = null;
    let sourceEmailBody: string | null = null;
    let related: RelatedRow[] = [];
    if (conv.kind === 'item' && conv.related_item_id) {
      const { data: nudgeRow } = await supabase
        .from('items')
        .select(
          'title, body, detail, suggestion, category, action_description, event_date, due_at, occurs_at, who_it_affects, urgency_level, source, kind, evidence, source_email_subject, source_email_sender',
        )
        .eq('id', conv.related_item_id)
        .eq('user_id', user.id)
        .maybeSingle();
      nudge = (nudgeRow as ItemRow | null) ?? null;

      if (nudge) {
        const [{ data: sourceEmail }, { data: relatedRows }] = await Promise.all([
          supabase
            .from('source_emails')
            .select('body_text')
            .eq('item_id', conv.related_item_id)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('items')
            .select('title, kind, prep_origin, status')
            .eq('parent_id', conv.related_item_id)
            .eq('user_id', user.id)
            .neq('status', 'dismissed')
            .limit(20),
        ]);
        const bodyText = (sourceEmail as { body_text?: string | null } | null)?.body_text?.trim();
        sourceEmailBody = bodyText || null;
        related = (relatedRows ?? []) as RelatedRow[];
      }
    }

    const { data: history, error: historyError } = await supabase
      .from('messages')
      .select('sender, body')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(40);

    if (historyError) {
      console.error('Failed to load messages:', historyError.message);
      return json({ error: 'Failed to load messages' }, 500);
    }

    const historyRows = (history ?? []) as MessageRow[];
    const system = buildSystemPrompt(conv, nudge, household, sourceEmailBody, familyFacts, related, opener);

    let claudeMessages = toClaudeMessages(historyRows);
    if (opener) {
      if (historyRows.length > 0) {
        const existing = historyRows.find((row) => row.sender === 'taylo');
        return json({
          success: true,
          reply: existing?.body ?? historyRows[0].body,
          already_open: true,
          title: conv.title,
        });
      }
      claudeMessages = [{ role: 'user', content: OPENER_USER_PROMPT }];
    } else if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== 'user') {
      return json({ error: 'No user message to reply to' }, 400);
    }

    const raw = await callClaude(anthropicKey, system, claudeMessages, opener ? 700 : 1024);
    const parsed = opener ? parseOpenerResult(raw) : { reply: raw, chips: [] as Chip[] };
    const reply = parsed.reply;

    const { data: inserted, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        sender: 'taylo',
        body: reply,
        has_email_card: false,
      })
      .select('id, body, created_at')
      .single();

    if (insertError || !inserted) {
      console.error('Failed to store reply:', insertError?.message);
      return json({ error: 'Failed to store reply' }, 500);
    }

    const firstUser = ((history ?? []) as MessageRow[]).find((row) => row.sender === 'user');
    const placeholder =
      !conv.title ||
      conv.title === 'Taylo' ||
      conv.title === 'New chat' ||
      (conv.kind === 'general' && conv.subtitle === 'New chat');
    let nextTitle: string | undefined;
    if (placeholder && firstUser?.body) {
      nextTitle = titleFromUserText(firstUser.body);
    } else if (nudge?.title && conv.title === 'Taylo') {
      nextTitle = nudge.title;
    }

    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
        ...(nextTitle ? { title: nextTitle, subtitle: 'Taylo' } : {}),
        ...(opener ? { suggestion_chips: parsed.chips } : {}),
      })
      .eq('id', conversationId)
      .eq('user_id', user.id);

    return json({
      success: true,
      reply: inserted.body,
      message_id: inserted.id,
      title: nextTitle ?? conv.title,
      chips: opener ? parsed.chips : undefined,
    });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

type Chip = { label: string; msg: string };

function parseOpenerResult(raw: string): { reply: string; chips: Chip[] } {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(trimmed) as { reply?: unknown; chips?: unknown };
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    if (!reply) throw new Error('empty opener reply');
    return { reply, chips: normalizeChips(parsed.chips) };
  } catch {
    return { reply: trimmed, chips: [] };
  }
}

function normalizeChips(raw: unknown): Chip[] {
  if (!Array.isArray(raw)) return [];
  const chips: Chip[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const label = String((item as Chip).label ?? '').replace(/\s+/g, ' ').trim();
    const msg = String((item as Chip).msg ?? '').replace(/\s+/g, ' ').trim();
    if (!label || !msg) continue;
    chips.push(chipAsParentAsk(label.slice(0, 32), msg));
    if (chips.length >= 3) break;
  }
  return chips;
}

const CHIP_PARENT_ASK =
  /^(give me|can you|could you|would you|please |what |what's |whats |how |suggest |draft |remind me|send me|help me|i need|i want|tell me|write |start |add )/i;
const CHIP_ASSISTANT_VOICE =
  /^(here(?:'s| is| are)\b|you might\b|you could\b|you may\b|i can\b|i['’]ll\b|let me\b)/i;

function chipAsParentAsk(label: string, msg: string): Chip {
  if (CHIP_ASSISTANT_VOICE.test(msg)) {
    return { label, msg: `Can you help with ${label.toLowerCase()}?` };
  }
  if (CHIP_PARENT_ASK.test(msg) || /[?]$/.test(msg)) return { label, msg };
  return { label, msg: `Give me ${msg.charAt(0).toLowerCase()}${msg.slice(1)}` };
}

function titleFromUserText(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean).slice(0, 6);
  let title = words.join(' ');
  if (title.length > 36) title = `${title.slice(0, 34).trim()}…`;
  if (!title) return 'Chat';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

async function loadFamilyFacts(
  supabase: SupabaseClient,
  userId: string,
): Promise<FamilyFactRow[]> {
  const { data, error } = await supabase
    .from('family_facts')
    .select('subject, fact, category')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Failed to load family facts:', error.message);
    return [];
  }
  return (data ?? []) as FamilyFactRow[];
}

function familyFactsBlock(facts: FamilyFactRow[]): string {
  if (!facts.length) return '';
  const lines = facts.map((row) => {
    const who = row.subject.trim() || 'family';
    const category = row.category ? ` [${row.category}]` : '';
    return `- ${who}${category}: ${row.fact.trim()}`;
  });
  return `Known family context (treat as true unless they correct you; do not dump this list unless asked):\n${lines.join('\n')}`;
}

function buildSystemPrompt(
  conv: ConversationRow,
  nudge: ItemRow | null,
  household: Household,
  sourceEmailBody: string | null,
  familyFacts: FamilyFactRow[],
  related: RelatedRow[],
  opener: boolean,
): string {
  const parts = [TAYLO_SYSTEM_PROMPT, householdVoiceBlock(household)];
  if (opener) parts.push(OPENER_STYLE);
  const facts = familyFactsBlock(familyFacts);
  if (facts) parts.push(facts);

  if (nudge) {
    parts.push(
      `This thread is about a specific household item. You already have the brief — use it. The parent may ask for ideas, drafts, packing lists, dates, or just talk it through.

Item brief:
Title: ${nudge.title ?? conv.title}
What you told them: ${nudge.body ?? ''}
Detail: ${nudge.detail ?? ''}
Suggested next step: ${nudge.suggestion ?? 'not specified'}
Category: ${nudge.category ?? 'unknown'}
Kind: ${nudge.kind ?? 'not specified'}
Source: ${nudge.source ?? 'not specified'}
Action: ${nudge.action_description ?? 'not specified'}
Event date: ${nudge.event_date ?? 'not specified'}
Happens at: ${nudge.occurs_at ?? 'not specified'}
Due: ${nudge.due_at ?? 'not specified'}
Who it affects: ${whoForPrompt(nudge.who_it_affects, household)}
Urgency: ${nudge.urgency_level ?? 'not specified'}
Evidence: ${nudge.evidence ?? 'not specified'}
Email subject: ${nudge.source_email_subject ?? 'not specified'}
Email from: ${nudge.source_email_sender ?? 'not specified'}`,
    );
    if (related.length) {
      const lines = related
        .map((row) => {
          const title = (row.title || '').trim();
          if (!title) return null;
          const bits = [row.kind, row.prep_origin, row.status].filter(Boolean);
          return `- ${title}${bits.length ? ` (${bits.join(', ')})` : ''}`;
        })
        .filter((line): line is string => !!line);
      if (lines.length) {
        parts.push(`Related prep / child items on this:\n${lines.join('\n')}`);
      }
    }
    if (sourceEmailBody) {
      parts.push(`Source email body (use this for follow-up detail; do not recap it unless asked):\n${sourceEmailBody}`);
    }
  } else if (conv.kind === 'item') {
    parts.push(
      `This thread is about: ${conv.title}${conv.subtitle ? ` (${conv.subtitle})` : ''}. You don't have a linked email snapshot — only this title. Still help as a capable assistant using the title and anything they tell you.`,
    );
  } else {
    parts.push('This is a general chat. No item is attached. Help with whatever family admin they bring up.');
  }

  return parts.join('\n\n');
}

function toClaudeMessages(rows: MessageRow[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const mapped: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const row of rows) {
    const role = row.sender === 'user' ? 'user' : 'assistant';
    const prev = mapped[mapped.length - 1];
    if (prev && prev.role === role) {
      prev.content = `${prev.content}\n\n${row.body}`;
    } else {
      mapped.push({ role, content: row.body });
    }
  }
  if (mapped.length && mapped[0].role === 'assistant') {
    mapped.unshift({
      role: 'user',
      content:
        '(The parent opened this chat. Your next message is the opener you already sent. After that, every user message is the parent asking you for help — they are never speaking as Taylo.)',
    });
  }
  return mapped;
}

async function callClaude(
  apiKey: string,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 512,
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
      messages,
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
