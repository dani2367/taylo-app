import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  CHECKLIST_PROMPT_RULE,
  insertPrepChecklist,
  parseChecklistLabels,
} from '../_shared/checklists.ts';
import { householdVoiceBlock, loadHousehold, type Household } from '../_shared/household.ts';

const MICROSOFT_TOKEN_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_CLIENT_ID = 'f976566d-39c1-48bc-b140-e7a5a727afd5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5';
const SENDER_BLOCKLIST = ['noreply', 'no-reply', 'donotreply', 'marketing', 'newsletter'];
const SUBJECT_BLOCKLIST = ['unsubscribe', '% off', 'sale', 'offer', 'deal', 'discount'];
const CLASSIFY_PROMPT =
  'You are Taylo, a family assistant. Classify this email into exactly one of these categories and reply with only the category name, nothing else: school, medical, activity, delivery, returns, financial, ignore.\n\nCategory definitions:\n- school: anything from a school, nursery, or childcare provider\n- medical: appointments, prescriptions, NHS, GP, hospital, dental\n- activity: sports clubs, after-school activities, classes, community groups\n- delivery: order confirmations, parcel tracking, courier notifications\n- returns: return confirmations, refund notifications, exchange requests, return labels\n- financial: bills, renewals, subscriptions, invoices\n- ignore: marketing, promotions, social media, anything not relevant to family life';
const EXTRACT_PROMPT = `You are Taylo, a family assistant. Extract the key information from this email and return ONLY a JSON object in this exact format, nothing else:
{
  "category": "school|medical|activity|delivery|returns|financial",
  "action_required": true or false,
  "action_description": "what the parent needs to do in plain English, or null",
  "date": "YYYY-MM-DD or null",
  "who_it_affects": "which family member or whole family",
  "urgency": "today|this_week|upcoming|none",
  "nudge_title": "the action for the parent, under 8 words — e.g. Book your dental checkup — or null if no action needed",
  "nudge_body": "one short subtitle under the title, maximum ~12 words, a single extra fact — not a paragraph — or null if no action needed",
  "nudge_detail": "2-3 conversational sentences for the expanded card, like a friend filling in the context — or null if no action needed",
  "suggestion": "the action itself, no label — e.g. Reply confirming you'll attend — or null if no action needed",
  "checklist_items": ["Present", "Card"] or null
}

Voice and length (this copy is shown on Home and Plan, not as an email summary):
- Calm, capable-friend register. Never alarmed or urgent-sounding. No exclamation marks. Never "don't forget", "you need to", "make sure", or "urgent".
- Observational and matter-of-fact. You notice things; you don't nag.
- Don't use emoji. The app has its own icons.
- Address the parent as "you". Never write the parent's name in the third person.
- If the email is about a child, use the child's name (e.g. Arlo) in body, detail, who_it_affects, and in the title when it helps ("Sign Arlo's trip form").
- nudge_title: the action, short, like a list item.
- nudge_body: one clipped line of extra info (date, place, whose it is). No subordinate clauses. No "would be great to…".
- nudge_detail: natural spoken English when the card expands — a friend filling in the context, not a recap of the title. This is what they read on Plan and Home.
- suggestion: just the next step. Do not start with "Suggested".

Sound like this (few-shot — match this tone):
- "Arlo's birthday is Saturday. You might want to pick up a card."
- "Sports day is Thursday. Kit is still on the list if you want to pack tonight."
- "The dentist is booked for the 19th. Nothing needed until then."

Not like this: "Don't forget Arlo's birthday!" / "You need to buy a birthday card!" / "Urgent: pack the sports kit."
${CHECKLIST_PROMPT_RULE}

Category guidance:
- delivery: only action_required true if someone needs to be home, or delivery failed
- returns: action_required true if a return label needs printing, item needs dropping off, or deadline is approaching
- school: action_required true if permission, payment, or RSVP is needed
- medical: action_required true if appointment confirmation needed or preparation required
If no action is required, set action_required to false and nudge_title, nudge_body, nudge_detail, and suggestion to null.`;

function extractPrompt(household: Household): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  return `${EXTRACT_PROMPT}

Date rules:
- Today is ${today} (Europe/London).
- If the email gives a day and month with no year, use this year or the next occurrence — never last year just because the weekday matches.
- A school trip on "9 September" extracted in September ${today.slice(0, 4)} is ${today.slice(0, 4)}-09-09, not last year.

Who you are talking to:
${householdVoiceBlock(household)}`;
}

type Connection = {
  user_id: string;
  refresh_token: string;
};

const EMAIL_BODY_MAX_CHARS = 3000;

type GraphEmail = {
  sender?: { emailAddress?: { address?: string; name?: string } };
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  receivedDateTime?: string;
  parentFolderId?: string;
};

type ExtractedNudge = {
  category: string;
  action_required: boolean;
  action_description: string | null;
  date: string | null;
  who_it_affects: string | null;
  urgency: string;
  nudge_title: string | null;
  nudge_body: string | null;
  nudge_detail: string | null;
  suggestion: string | null;
  checklist_items: string[];
};

Deno.serve(async (req: Request) => {
  console.log('Handler called');
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

    let initial_sync = false;
    let targetUserId: string | undefined;
    try {
      const body = (await req.json()) as { initial_sync?: boolean; user_id?: string };
      initial_sync = Boolean(body?.initial_sync);
      targetUserId = typeof body?.user_id === 'string' ? body.user_id : undefined;
    } catch {
      // Scheduled invocations may have an empty body.
    }

    const windowDays = initial_sync ? 14 : 7;
    const unreadOnly = !initial_sync;

    let connectionsQuery = supabase
      .from('connections')
      .select('user_id, refresh_token')
      .eq('provider', 'microsoft')
      .not('refresh_token', 'is', null);

    if (initial_sync) {
      if (targetUserId) {
        connectionsQuery = connectionsQuery.eq('user_id', targetUserId);
      }
    } else {
      connectionsQuery = connectionsQuery.eq('initial_sync_done', true);
    }

    const { data: connections, error: connectionsError } = await connectionsQuery;

    if (connectionsError) {
      console.error('Failed to load connections:', connectionsError.message);
      if (initial_sync && targetUserId) {
        await setInitialSyncDone(supabase, targetUserId, false);
      }
      return json({ error: 'Failed to load connections' }, 500);
    }

    const stats = { connections: connections?.length ?? 0, processed: 0, created: 0, skipped: 0, errors: 0 };

    for (const connection of (connections ?? []) as Connection[]) {
      if (!connection.refresh_token || !connection.user_id) continue;

      console.log('Syncing user:', connection.user_id);

      try {
        const accessToken = await getFreshAccessToken(
          supabase,
          connection.user_id,
          connection.refresh_token,
        );
        const emails = await fetchEmails(accessToken, { unreadOnly, windowDays });
        console.log('Emails fetched:', emails.length);

        const household = await loadHousehold(supabase, connection.user_id);

        for (const email of emails) {
          try {
            const created = await processEmail(
              supabase,
              anthropicKey,
              connection.user_id,
              email,
              windowDays,
              household,
            );
            stats.processed += 1;
            if (created) stats.created += 1;
            else stats.skipped += 1;
          } catch (err) {
            stats.errors += 1;
            console.error('Failed to process email:', {
              user_id: connection.user_id,
              subject: email.subject,
              error: err,
            });
          }
        }

        if (initial_sync) {
          await setInitialSyncDone(supabase, connection.user_id, true);
        }
      } catch (err) {
        stats.errors += 1;
        console.error('Failed to fetch emails for user:', connection.user_id, err);
        if (initial_sync) {
          console.error('Initial Outlook backfill failed for user:', connection.user_id, err);
          await setInitialSyncDone(supabase, connection.user_id, false);
        }
      }
    }

    return json({ success: true, initial_sync, ...stats });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

async function processEmail(
  supabase: SupabaseClient,
  anthropicKey: string,
  userId: string,
  email: GraphEmail,
  windowDays: number,
  household: Household,
): Promise<boolean> {
  if (shouldDropEmail(email, windowDays)) return false;

  const sender = email.sender?.emailAddress?.address ?? '';
  const subject = email.subject ?? '';
  const bodyPreview = email.bodyPreview ?? '';

  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: dupError } = await supabase
    .from('items')
    .select('id')
    .eq('user_id', userId)
    .eq('source_email_subject', subject)
    .gte('created_at', windowStart)
    .limit(1);

  if (dupError) {
    throw new Error(`Duplicate check failed: ${dupError.message}`);
  }

  if (existing && existing.length > 0) {
    await ensureSourceEmail(supabase, userId, existing[0].id, email);
    return false;
  }

  const userMessage = `Sender: ${sender}\nSubject: ${subject}\nBody: ${bodyPreview}`;

  const category = (await callClaude(anthropicKey, CLASSIFY_PROMPT, userMessage, 32))
    .trim()
    .toLowerCase();

  console.log('Classification:', subject, '->', category);

  if (category === 'ignore') return false;

  const extractedRaw = await callClaude(
    anthropicKey,
    extractPrompt(household),
    userMessage,
    1024,
  );
  const extracted = parseExtracted(extractedRaw);

  console.log('Extraction:', subject, '-> action_required:', extracted.action_required);

  if (!extracted.action_required || !extracted.nudge_title || !extracted.nudge_body) {
    return false;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('items')
    .insert({
      user_id: userId,
      title: extracted.nudge_title,
      body: extracted.nudge_body,
      detail: extracted.nudge_detail,
      suggestion: extracted.suggestion,
      category: extracted.category,
      action_description: extracted.action_description,
      event_date: extracted.date,
      who_it_affects: extracted.who_it_affects,
      urgency_level: extracted.urgency,
      source: 'email',
      source_email_subject: subject,
      source_email_sender: sender,
      status: 'open',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to insert nudge: ${insertError?.message ?? 'no row'}`);
  }

  await ensureSourceEmail(supabase, userId, inserted.id, email);
  await insertPrepChecklist(supabase, {
    userId,
    itemId: inserted.id,
    itemTitle: extracted.nudge_title,
    labels: extracted.checklist_items,
  });
  return true;
}

async function ensureSourceEmail(
  supabase: SupabaseClient,
  userId: string,
  nudgeId: string,
  email: GraphEmail,
): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from('source_emails')
    .select('id')
    .eq('item_id', nudgeId)
    .limit(1);

  if (lookupError) {
    throw new Error(`Source email lookup failed: ${lookupError.message}`);
  }
  if (existing && existing.length > 0) return;

  const { error: insertError } = await supabase.from('source_emails').insert({
    user_id: userId,
    item_id: nudgeId,
    subject: email.subject ?? '',
    sender: email.sender?.emailAddress?.address ?? '',
    body_text: trimEmailBody(email),
    received_at: email.receivedDateTime ?? null,
  });

  if (insertError) {
    throw new Error(`Failed to insert source email: ${insertError.message}`);
  }
}

function trimEmailBody(email: GraphEmail): string {
  const contentType = (email.body?.contentType ?? '').toLowerCase();
  let raw = email.body?.content ?? email.bodyPreview ?? '';
  if (contentType === 'html' || /<[a-z][\s\S]*>/i.test(raw)) {
    raw = raw
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/gi, '"');
  }
  return raw.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
    .slice(0, EMAIL_BODY_MAX_CHARS);
}

function shouldDropEmail(email: GraphEmail, windowDays: number): boolean {
  const sender = (email.sender?.emailAddress?.address ?? '').toLowerCase();
  const subject = (email.subject ?? '').toLowerCase();
  const received = email.receivedDateTime ? new Date(email.receivedDateTime) : null;
  const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  if (SENDER_BLOCKLIST.some((token) => sender.includes(token))) {
    console.log('Dropping email:', email.subject, 'reason: sender');
    return true;
  }
  if (SUBJECT_BLOCKLIST.some((token) => subject.includes(token))) {
    console.log('Dropping email:', email.subject, 'reason: subject');
    return true;
  }
  if (received && received.getTime() < windowStart) {
    console.log('Dropping email:', email.subject, 'reason: age');
    return true;
  }

  return false;
}

async function getFreshAccessToken(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: MICROSOFT_CLIENT_ID,
    refresh_token: refreshToken,
    scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Calendars.Read offline_access',
  });

  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const body = await res.text();
  console.log('Microsoft token refresh status:', res.status);

  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed (${res.status})`);
  }

  const tokens = JSON.parse(body) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const update: { access_token: string; expires_at: string; updated_at: string; refresh_token?: string } = {
    access_token: tokens.access_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (tokens.refresh_token) {
    update.refresh_token = tokens.refresh_token;
  }

  const { error } = await supabase
    .from('connections')
    .update(update)
    .eq('user_id', userId)
    .eq('provider', 'microsoft');

  if (error) {
    throw new Error(`Failed to store refreshed token: ${error.message}`);
  }

  return tokens.access_token;
}

async function setInitialSyncDone(
  supabase: SupabaseClient,
  userId: string,
  done: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('connections')
    .update({ initial_sync_done: done, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'microsoft');

  if (error) {
    console.error('Failed to update initial_sync_done:', error.message);
  }
}

async function fetchEmails(
  accessToken: string,
  options: { unreadOnly: boolean; windowDays: number },
): Promise<GraphEmail[]> {
  console.log('Step 1: fetchEmails called, token length:', accessToken?.length);

  const since = new Date(Date.now() - options.windowDays * 24 * 60 * 60 * 1000).toISOString();
  const filter = options.unreadOnly
    ? `isRead eq false and receivedDateTime ge ${since}`
    : `receivedDateTime ge ${since}`;
  const top = options.unreadOnly ? 5 : 50;
  const url =
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=sender,subject,bodyPreview,body,receivedDateTime,parentFolderId&$filter=${encodeURIComponent(filter)}`;
  console.log('Step 2: calling URL:', url);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      Prefer: 'outlook.body-content-type="text"',
    },
  });

  console.log('Step 3: response status:', res.status);
  const body = await res.text();
  console.log('Step 4: response body preview:', body.slice(0, 200));

  if (!res.ok) {
    throw new Error(`Graph API failed (${res.status}): ${body}`);
  }

  const data = JSON.parse(body) as { value?: GraphEmail[] };
  return data.value ?? [];
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
  return data.content?.find((block) => block.type === 'text')?.text ?? '';
}

function parseExtracted(raw: string): ExtractedNudge {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed) as ExtractedNudge;
  return {
    category: parsed.category,
    action_required: Boolean(parsed.action_required),
    action_description: parsed.action_description ?? null,
    date: parsed.date ?? null,
    who_it_affects: parsed.who_it_affects ?? null,
    urgency: parsed.urgency,
    nudge_title: parsed.nudge_title ?? null,
    nudge_body: parsed.nudge_body ?? null,
    nudge_detail: parsed.nudge_detail ?? null,
    suggestion: parsed.suggestion ?? null,
    checklist_items: parseChecklistLabels(parsed.checklist_items),
  };
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
