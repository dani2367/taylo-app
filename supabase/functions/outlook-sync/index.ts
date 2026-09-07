import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { insertIntakeChildren, parseChecklistLabels } from '../_shared/checklists.ts';
import { householdVoiceBlock, loadHousehold, type Household } from '../_shared/household.ts';
import {
  eventDateFromIntake,
  finalizeSourceItems,
  intakeContractRules,
  intakeRowFields,
  splitParentAndChildren,
  type IntakeItem,
} from '../_shared/intake-contract.ts';
import { getFreshMicrosoftAccessToken, type MicrosoftConnection } from '../_shared/microsoft.ts';
import { outlookPrefilterReason } from '../_shared/outlook-email-filter.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5';
const SENDER_BLOCKLIST = ['noreply', 'no-reply', 'donotreply', 'marketing', 'newsletter'];
const SUBJECT_BLOCKLIST = ['unsubscribe', '% off', 'sale', 'offer', 'deal', 'discount'];
const CLASSIFY_PROMPT = `You are Taylo, a family assistant. Classify this email into exactly one of these categories and reply with only the category name, nothing else: school, medical, activity, delivery, returns, financial, ignore.

Category definitions:
- school: school, nursery, childcare, or a parent email about a child's school life (trips, sports day, forms, term dates)
- medical: appointments, prescriptions, NHS, GP, hospital, dental
- activity: sports clubs, after-school activities, classes, parties, playdates, community groups
- delivery: order confirmations, parcel tracking, courier notifications
- returns: return confirmations, refund notifications, exchange requests, return labels
- financial: bills, renewals, subscriptions, invoices, deadlines to pay
- ignore: marketing, promotions, social media, receipts with nothing to do, newsletters with no dated family event or implied prep`;
const EXTRACT_PROMPT = `You are Taylo, a family assistant. Pull helpful relevance from this email — not a summary of the inbox. Return ONLY a JSON object, nothing else:
{
  "category": "school|medical|activity|delivery|returns|financial",
  "action_required": true or false,
  "action_description": "a helpful heads-up in plain English, or null",
  "date": "YYYY-MM-DD or null — this is due_at, never occurs_at",
  "who_it_affects": "which family member or whole family",
  "urgency": "today|this_week|upcoming|none",
  "nudge_title": "short title under 8 words, or null",
  "nudge_body": "one short subtitle under the title, maximum ~12 words, a single extra fact — or null",
  "nudge_detail": "1-2 conversational sentences for the expanded card — or null",
  "suggestion": "the helpful next step or radar line, no label — or null",
  "items": [ parent intake item first, then each separate obligation ]
}

action_required is true when the email is worth putting on the parent's radar: a real admin step (form, RSVP, payment, print a label), OR a family-life heads-up you can be specific about (sports day, trip, party, named appointment, birthday) even if nothing is due today. It is false for noise: tracking that is fine, statements, generic newsletters, "your order has been placed" with no date they must be in for.

If action_required is false, set action_description, nudge_title, nudge_body, nudge_detail, suggestion, and items to null/empty.

If action_required is true:
- items[0] is the parent heads-up (kind is never occurrence). Dates in the email go on due_at.
- Further items are separate obligations (packed lunch, waterproof coat) — never a checklist blob.
- nudge_title: the thing, short. A hard action ("Sign Arlo's trip form") or the event ("Arlo's sports day").
- nudge_body: one clipped extra fact (when, where, whose). No subordinate clauses.
- suggestion and action_description: required. One or two short sentences like a friend putting it on their radar. Mention prep only when stated or a high-confidence type default. Offer help, don't instruct.
- nudge_detail: the same helpful voice when the card expands — not a recap of the subject line.

Voice (this copy is shown on Home and Plan, not as an email summary):
- Calm, capable-friend register. Never alarmed. No exclamation marks. Never "don't forget", "you need to", "make sure", or "urgent".
- Don't use emoji. Address the parent as "you". Never write the parent's name in the third person.
- If the email is about a child, use the child's name.

Sound like this:
- "Sports day is Saturday. Kit is on the list if you want to pack tonight."
- "Arlo's birthday is Saturday. You might want to pick up a card."
- "The dentist is booked for the 19th. Tell me if you want help with what to take."

Not like this: "Don't forget Arlo's birthday!" / "You need to buy a birthday card!" / "This email is about sports day."

Category guidance:
- school / medical / activity: prefer a heads-up over dropping the email, if you can name the event and the likely help. Skip only if there is no date, no prep, and no admin.
- delivery: action_required true only if someone needs to be home, or delivery failed
- returns: action_required true if a label needs printing, an item needs dropping off, or a deadline is approaching
- financial: action_required true if a payment, renewal, or deadline is actually coming — not a statement or receipt`;

function extractPrompt(household: Household): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  return `${EXTRACT_PROMPT}

${intakeContractRules('email')}

Date rules:
- Today is ${today} (Europe/London).
- If the email gives a day and month with no year, use this year or the next occurrence — never last year just because the weekday matches.
- A school trip on "9 September" extracted in September ${today.slice(0, 4)} is ${today.slice(0, 4)}-09-09, not last year.
- Put that date on due_at / the "date" field. occurs_at must be null.

Who you are talking to:
${householdVoiceBlock(household)}`;
}

type Connection = MicrosoftConnection;

const EMAIL_BODY_MAX_CHARS = 3000;
const RECENT_READ_HOURS = 48;

type GraphEmail = {
  id?: string;
  inferenceClassification?: string;
  internetMessageHeaders?: { name?: string; value?: string }[];
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
  items: IntakeItem[];
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
      .select('user_id, refresh_token, access_token, expires_at')
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
        const accessToken = await getFreshMicrosoftAccessToken(supabase, connection);
        const emails = await fetchEmails(accessToken, { unreadOnly, windowDays });
        console.log('Emails fetched:', emails.length);

        const household = await loadHousehold(supabase, connection.user_id);
        const alreadySeen = await loadSeenMessageIds(
          supabase,
          connection.user_id,
          emails.map((email) => emailMessageId(email)).filter((id): id is string => !!id),
        );

        for (const email of emails) {
          try {
            const messageId = emailMessageId(email);
            if (messageId && alreadySeen.has(messageId)) {
              stats.skipped += 1;
              continue;
            }
            const created = await processEmail(
              supabase,
              anthropicKey,
              connection.user_id,
              email,
              windowDays,
              household,
            );
            if (messageId) alreadySeen.add(messageId);
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

function emailMessageId(email: GraphEmail): string | null {
  if (email.id?.trim()) return email.id.trim();
  const subject = email.subject ?? '';
  const sender = email.sender?.emailAddress?.address ?? '';
  const received = email.receivedDateTime ?? '';
  if (!subject && !sender && !received) return null;
  return `fallback:${received}|${sender}|${subject}`.slice(0, 500);
}

async function loadSeenMessageIds(
  supabase: SupabaseClient,
  userId: string,
  messageIds: string[],
): Promise<Set<string>> {
  const seen = new Set<string>();
  if (!messageIds.length) return seen;
  const { data, error } = await supabase
    .from('email_seen')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', messageIds);
  if (error) {
    console.error('Failed to load seen emails:', error.message);
    return seen;
  }
  for (const row of data ?? []) {
    if (row.message_id) seen.add(row.message_id);
  }
  return seen;
}

async function markEmailSeen(
  supabase: SupabaseClient,
  userId: string,
  email: GraphEmail,
  disposition: 'created' | 'ignored' | 'no_action' | 'duplicate' | 'filtered',
): Promise<void> {
  const messageId = emailMessageId(email);
  if (!messageId) return;
  const { error } = await supabase.from('email_seen').upsert(
    {
      user_id: userId,
      message_id: messageId,
      subject: email.subject ?? '',
      disposition,
    },
    { onConflict: 'user_id,message_id' },
  );
  if (error) console.error('Failed to remember processed email:', error.message);
}

async function processEmail(
  supabase: SupabaseClient,
  anthropicKey: string,
  userId: string,
  email: GraphEmail,
  windowDays: number,
  household: Household,
): Promise<boolean> {
  const dropReason = dropReasonForEmail(email, windowDays);
  if (dropReason) {
    if (dropReason !== 'age') await markEmailSeen(supabase, userId, email, 'filtered');
    return false;
  }

  const outlookReason = outlookPrefilterReason(email);
  if (outlookReason) {
    console.log('Dropping email:', email.subject, 'reason:', outlookReason);
    await markEmailSeen(supabase, userId, email, 'filtered');
    return false;
  }

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
    await markEmailSeen(supabase, userId, email, 'duplicate');
    return false;
  }

  const userMessage = `Sender: ${sender}\nSubject: ${subject}\nBody: ${bodyPreview}`;

  const category = (await callClaude(anthropicKey, CLASSIFY_PROMPT, userMessage, 32))
    .trim()
    .toLowerCase();

  console.log('Classification:', subject, '->', category);

  if (category === 'ignore') {
    await markEmailSeen(supabase, userId, email, 'ignored');
    return false;
  }

  const extractedRaw = await callClaude(
    anthropicKey,
    extractPrompt(household),
    userMessage,
    2200,
  );
  const extracted = parseExtracted(extractedRaw, userMessage);

  console.log('Extraction:', subject, '-> action_required:', extracted.action_required);

  const help = (extracted.suggestion || extracted.action_description || '').trim() || null;
  if (!extracted.action_required || !extracted.nudge_title || (!extracted.nudge_body && !help)) {
    await markEmailSeen(supabase, userId, email, 'no_action');
    return false;
  }

  const { parent, children } = splitParentAndChildren(extracted.items, extracted.nudge_title);
  const { data: inserted, error: insertError } = await supabase
    .from('items')
    .insert({
      user_id: userId,
      title: extracted.nudge_title,
      body: extracted.nudge_body,
      detail: extracted.nudge_detail || help,
      suggestion: extracted.suggestion || help,
      category: extracted.category,
      action_description: extracted.action_description || help,
      event_date: eventDateFromIntake(parent, 'email') ?? extracted.date,
      who_it_affects: extracted.who_it_affects,
      urgency_level: extracted.urgency,
      source: 'email',
      source_email_subject: subject,
      source_email_sender: sender,
      status: 'open',
      ...(intakeRowFields(parent)),
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to insert nudge: ${insertError?.message ?? 'no row'}`);
  }

  await ensureSourceEmail(supabase, userId, inserted.id, email);
  await markEmailSeen(supabase, userId, email, 'created');
  await insertIntakeChildren(supabase, {
    userId,
    itemId: inserted.id,
    items: children,
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

function dropReasonForEmail(email: GraphEmail, windowDays: number): string | null {
  const sender = (email.sender?.emailAddress?.address ?? '').toLowerCase();
  const subject = (email.subject ?? '').toLowerCase();
  const received = email.receivedDateTime ? new Date(email.receivedDateTime) : null;
  const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  if (SENDER_BLOCKLIST.some((token) => sender.includes(token))) {
    console.log('Dropping email:', email.subject, 'reason: sender');
    return 'sender';
  }
  if (SUBJECT_BLOCKLIST.some((token) => subject.includes(token))) {
    console.log('Dropping email:', email.subject, 'reason: subject');
    return 'subject';
  }
  if (received && received.getTime() < windowStart) {
    console.log('Dropping email:', email.subject, 'reason: age');
    return 'age';
  }

  return null;
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

const GRAPH_MESSAGE_SELECT =
  'id,sender,subject,bodyPreview,body,receivedDateTime,parentFolderId,inferenceClassification';

function mergeEmails(...lists: GraphEmail[][]): GraphEmail[] {
  const seen = new Set<string>();
  const merged: GraphEmail[] = [];
  for (const list of lists) {
    for (const email of list) {
      const id = emailMessageId(email);
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      merged.push(email);
    }
  }
  return merged;
}

async function fetchEmails(
  accessToken: string,
  options: { unreadOnly: boolean; windowDays: number },
): Promise<GraphEmail[]> {
  console.log('Step 1: fetchEmails called, token length:', accessToken?.length);

  const sinceWindow = new Date(Date.now() - options.windowDays * 24 * 60 * 60 * 1000).toISOString();

  if (!options.unreadOnly) {
    return fetchInboxByClassification(accessToken, `receivedDateTime ge ${sinceWindow}`, 40, 20);
  }

  const sinceRead = new Date(Date.now() - RECENT_READ_HOURS * 60 * 60 * 1000).toISOString();
  const [unread, recentRead] = await Promise.all([
    fetchInboxByClassification(
      accessToken,
      `isRead eq false and receivedDateTime ge ${sinceWindow}`,
      25,
      25,
    ),
    fetchInboxByClassification(
      accessToken,
      `isRead eq true and receivedDateTime ge ${sinceRead}`,
      25,
      25,
    ),
  ]);
  console.log('Emails fetched unread:', unread.length, 'recent read:', recentRead.length);
  return mergeEmails(unread, recentRead);
}

async function fetchInboxByClassification(
  accessToken: string,
  baseFilter: string,
  focusedTop: number,
  otherTop: number,
): Promise<GraphEmail[]> {
  try {
    const [focused, other] = await Promise.all([
      fetchInboxMessages(accessToken, `${baseFilter} and inferenceClassification eq 'focused'`, focusedTop),
      fetchInboxMessages(accessToken, `${baseFilter} and inferenceClassification eq 'other'`, otherTop),
    ]);
    console.log('Emails fetched focused:', focused.length, 'other:', other.length, 'filter:', baseFilter);
    return [...focused, ...other];
  } catch (err) {
    console.error('Focused/Other Graph filter failed, falling back to unfiltered inbox:', err);
    return fetchInboxMessages(accessToken, baseFilter, focusedTop + otherTop);
  }
}

async function fetchInboxMessages(
  accessToken: string,
  filter: string,
  top: number,
): Promise<GraphEmail[]> {
  const url =
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${GRAPH_MESSAGE_SELECT}&$filter=${encodeURIComponent(filter)}`;
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

function parseExtracted(raw: string, sourceText: string): ExtractedNudge {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed) as ExtractedNudge & {
    date?: string | null;
    items?: unknown;
    checklist_items?: unknown;
  };
  const date = typeof parsed.date === 'string' ? parsed.date : null;
  return {
    category: parsed.category,
    action_required: Boolean(parsed.action_required),
    action_description: parsed.action_description ?? null,
    date,
    who_it_affects: parsed.who_it_affects ?? null,
    urgency: parsed.urgency,
    nudge_title: parsed.nudge_title ?? null,
    nudge_body: parsed.nudge_body ?? null,
    nudge_detail: parsed.nudge_detail ?? null,
    suggestion: parsed.suggestion ?? null,
    items: finalizeSourceItems({
      source: 'email',
      sourceText,
      fallbackTitle: parsed.nudge_title,
      date,
      rawItems: parsed.items,
      extraLabels: parseChecklistLabels(parsed.checklist_items),
    }),
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
