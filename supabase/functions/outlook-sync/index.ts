import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const MICROSOFT_TOKEN_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_CLIENT_ID = 'f976566d-39c1-48bc-b140-e7a5a727afd5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5';
const SENDER_BLOCKLIST = ['noreply', 'no-reply', 'donotreply', 'marketing', 'newsletter'];
const SUBJECT_BLOCKLIST = ['unsubscribe', '% off', 'sale', 'offer', 'deal', 'discount'];
const CLASSIFY_PROMPT =
  'You are Taylo, a family assistant. Classify this email into exactly one of these categories and reply with only the category name, nothing else: school, medical, activity, delivery, returns, financial, ignore.\n\nCategory definitions:\n- school: anything from a school, nursery, or childcare provider\n- medical: appointments, prescriptions, NHS, GP, hospital, dental\n- activity: sports clubs, after-school activities, classes, community groups\n- delivery: order confirmations, parcel tracking, courier notifications\n- returns: return confirmations, refund notifications, exchange requests, return labels\n- financial: bills, renewals, subscriptions, invoices\n- ignore: marketing, promotions, social media, anything not relevant to family life';
const EXTRACT_PROMPT =
  'You are Taylo, a family assistant. Extract the key information from this email and return ONLY a JSON object in this exact format, nothing else:\n{\n  "category": "school|medical|activity|delivery|returns|financial",\n  "action_required": true or false,\n  "action_description": "what the parent needs to do in plain English, or null",\n  "date": "YYYY-MM-DD or null",\n  "who_it_affects": "which family member or whole family",\n  "urgency": "today|this_week|upcoming|none",\n  "nudge_title": "under 8 words, warm and specific, or null if no action needed",\n  "nudge_body": "one sentence, warm tone, written as if from a trusted friend, or null if no action needed"\n}\n\nCategory guidance:\n- delivery: only action_required true if someone needs to be home, or delivery failed\n- returns: action_required true if a return label needs printing, item needs dropping off, or deadline is approaching\n- school: action_required true if permission, payment, or RSVP is needed\n- medical: action_required true if appointment confirmation needed or preparation required\nIf no action is required, set action_required to false and nudge_title and nudge_body to null.';

type Connection = {
  user_id: string;
  refresh_token: string;
};

type GraphEmail = {
  sender?: { emailAddress?: { address?: string; name?: string } };
  subject?: string;
  bodyPreview?: string;
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

    const nowIso = new Date().toISOString();
    const { data: connections, error: connectionsError } = await supabase
      .from('connections')
      .select('user_id, refresh_token')
      .eq('provider', 'microsoft')
      .gt('expires_at', nowIso);

    if (connectionsError) {
      console.error('Failed to load connections:', connectionsError.message);
      return json({ error: 'Failed to load connections' }, 500);
    }

    const stats = { connections: connections?.length ?? 0, processed: 0, created: 0, skipped: 0, errors: 0 };

    for (const connection of (connections ?? []) as Connection[]) {
      if (!connection.refresh_token || !connection.user_id) continue;

      let emails: GraphEmail[] = [];
      try {
        const accessToken = await getFreshAccessToken(
          supabase,
          connection.user_id,
          connection.refresh_token,
        );
        emails = await fetchUnreadEmails(accessToken);
        console.log('Emails fetched:', emails.length);
      } catch (err) {
        stats.errors += 1;
        console.error('Failed to fetch emails for user:', connection.user_id, err);
        continue;
      }

      for (const email of emails) {
        try {
          const created = await processEmail(supabase, anthropicKey, connection.user_id, email);
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
    }

    return json({ success: true, ...stats });
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
): Promise<boolean> {
  if (shouldDropEmail(email)) return false;

  const sender = email.sender?.emailAddress?.address ?? '';
  const subject = email.subject ?? '';
  const bodyPreview = email.bodyPreview ?? '';
  const userMessage = `Sender: ${sender}\nSubject: ${subject}\nBody: ${bodyPreview}`;

  const category = (await callClaude(anthropicKey, CLASSIFY_PROMPT, userMessage, 32))
    .trim()
    .toLowerCase();

  console.log('Classification:', subject, '->', category);

  if (category === 'ignore') return false;

  const extractedRaw = await callClaude(anthropicKey, EXTRACT_PROMPT, userMessage, 512);
  const extracted = parseExtracted(extractedRaw);

  console.log('Extraction:', subject, '-> action_required:', extracted.action_required);

  if (!extracted.action_required || !extracted.nudge_title || !extracted.nudge_body) {
    return false;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: dupError } = await supabase
    .from('nudges')
    .select('id')
    .eq('user_id', userId)
    .eq('source_email_subject', subject)
    .gte('created_at', sevenDaysAgo)
    .limit(1);

  if (dupError) {
    throw new Error(`Duplicate check failed: ${dupError.message}`);
  }

  if (existing && existing.length > 0) return false;

  const { error: insertError } = await supabase.from('nudges').insert({
    user_id: userId,
    title: extracted.nudge_title,
    body: extracted.nudge_body,
    category: extracted.category,
    action_description: extracted.action_description,
    due_date: extracted.date,
    who_it_affects: extracted.who_it_affects,
    urgency_level: extracted.urgency,
    source_email_subject: subject,
    source_email_sender: sender,
    urgent: extracted.urgency === 'today',
    status: 'open',
  });

  if (insertError) {
    throw new Error(`Failed to insert nudge: ${insertError.message}`);
  }

  return true;
}

function shouldDropEmail(email: GraphEmail): boolean {
  const sender = (email.sender?.emailAddress?.address ?? '').toLowerCase();
  const subject = (email.subject ?? '').toLowerCase();
  const received = email.receivedDateTime ? new Date(email.receivedDateTime) : null;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (SENDER_BLOCKLIST.some((token) => sender.includes(token))) {
    console.log('Dropping email:', email.subject, 'reason: sender');
    return true;
  }
  if (SUBJECT_BLOCKLIST.some((token) => subject.includes(token))) {
    console.log('Dropping email:', email.subject, 'reason: subject');
    return true;
  }
  if (received && received.getTime() < sevenDaysAgo) {
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
  console.log('Microsoft token refresh body:', body);

  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed (${res.status}): ${body}`);
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

async function fetchUnreadEmails(accessToken: string): Promise<GraphEmail[]> {
  console.log('Step 1: fetchUnreadEmails called, token length:', accessToken?.length);

  const url =
    'https://graph.microsoft.com/v1.0/me/messages?$top=5&$orderby=receivedDateTime desc&$select=sender,subject,bodyPreview,receivedDateTime,parentFolderId';
  console.log('Step 2: calling URL:', url);
  console.log('Auth header preview:', `Bearer ${accessToken}`.slice(0, 30), '...', `Bearer ${accessToken}`.slice(-10));

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
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
