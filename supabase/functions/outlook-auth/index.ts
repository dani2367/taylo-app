import { createClient } from 'jsr:@supabase/supabase-js@2';
import { applyMicrosoftClientAuth, MICROSOFT_CLIENT_ID } from '../_shared/microsoft.ts';

const CLIENT_ID = MICROSOFT_CLIENT_ID;
const AUTHORIZE_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_SCOPES = [
  'openid',
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Calendars.Read',
].join(' ');

type StartBody = {
  action?: string;
  app_redirect?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
};

type SignedState = {
  uid: string;
  verifier: string;
  appRedirect: string;
  exp: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing required environment variables');
      return json({ error: 'Server misconfiguration' }, 500);
    }

    const redirectUri = microsoftRedirectUri(supabaseUrl);

    if (req.method === 'GET') {
      return await handleMicrosoftCallback(req, supabaseUrl, serviceRoleKey, redirectUri);
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const user = await requireUser(req, supabaseUrl, serviceRoleKey);
    if ('error' in user) return user.error;

    const body = (await req.json()) as StartBody;

    if (body.action === 'start') {
      return await handleStart(user.id, body.app_redirect, redirectUri, serviceRoleKey);
    }

    return await handleLegacyExchange(
      user.id,
      body,
      supabaseUrl,
      serviceRoleKey,
    );
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

async function handleStart(
  userId: string,
  appRedirect: string | undefined,
  redirectUri: string,
  secret: string,
): Promise<Response> {
  if (!appRedirect || !isSafeAppRedirect(appRedirect)) {
    return json({ error: 'Missing or invalid app_redirect' }, 400);
  }

  const verifier = randomUrlToken(32);
  const challenge = await sha256Base64Url(verifier);
  const state = await signState(
    {
      uid: userId,
      verifier,
      appRedirect,
      exp: Date.now() + 10 * 60 * 1000,
    },
    secret,
  );

  const authUrl = new URL(AUTHORIZE_ENDPOINT);
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('scope', MICROSOFT_SCOPES);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  console.log('Outlook auth start', { userId, redirectUri });
  return json({ authUrl: authUrl.toString(), redirectUri });
}

async function handleMicrosoftCallback(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  redirectUri: string,
): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const msError = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  let appRedirect = 'tayloapp://outlook-auth';
  if (stateRaw) {
    try {
      const state = await verifyState(stateRaw, serviceRoleKey);
      appRedirect = state.appRedirect;
    } catch {
      // fall back to the production scheme
    }
  }

  if (msError) {
    console.error('Microsoft authorize error:', msError);
    return bounceToApp(appRedirect, { error: msError });
  }

  if (!code || !stateRaw) {
    return bounceToApp(appRedirect, { error: 'Missing authorization code' });
  }

  let state: SignedState;
  try {
    state = await verifyState(stateRaw, serviceRoleKey);
    appRedirect = state.appRedirect;
  } catch (err) {
    console.error('Invalid Outlook auth state:', err);
    return bounceToApp(appRedirect, { error: 'Login expired. Please try connecting again.' });
  }

  const exchanged = await exchangeMicrosoftCode(code, redirectUri, state.verifier);
  if (!exchanged.ok) {
    return bounceToApp(appRedirect, { error: exchanged.error });
  }

  const stored = await storeTokens(supabaseUrl, serviceRoleKey, state.uid, exchanged.tokens);
  if (!stored.ok) {
    return bounceToApp(appRedirect, { error: stored.error });
  }

  kickOffSyncs(supabaseUrl, serviceRoleKey, state.uid);
  return bounceToApp(appRedirect, { connected: '1' });
}

async function handleLegacyExchange(
  userId: string,
  body: StartBody,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<Response> {
  const { code, redirect_uri, code_verifier } = body;
  if (!code || !redirect_uri) {
    return json({ error: 'Missing code or redirect_uri' }, 400);
  }
  if (!code_verifier) {
    return json({ error: 'Missing code_verifier' }, 400);
  }

  const exchanged = await exchangeMicrosoftCode(code, redirect_uri, code_verifier);
  if (!exchanged.ok) {
    return json({ error: 'Token exchange failed', details: exchanged.error }, 502);
  }

  const stored = await storeTokens(supabaseUrl, serviceRoleKey, userId, exchanged.tokens);
  if (!stored.ok) {
    return json({ error: stored.error }, 500);
  }

  kickOffSyncs(supabaseUrl, serviceRoleKey, userId);
  return json({ success: true });
}

async function exchangeMicrosoftCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<
  | { ok: true; tokens: { access_token: string; refresh_token: string; expires_in: number } }
  | { ok: false; error: string }
> {
  // Do not send `scope` here. Microsoft treats token-request scopes as a
  // re-authorization; extra OIDC scopes that were not on the authorize
  // request cause AADSTS70000 for personal accounts.
  const tokenParams = new URLSearchParams({
    client_id: CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  applyMicrosoftClientAuth(tokenParams);

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });
  const tokenResBody = await tokenRes.text();

  if (!tokenRes.ok) {
    const hasSecret = Boolean(Deno.env.get('MICROSOFT_CLIENT_SECRET')?.trim());
    console.error('Microsoft token exchange failed:', {
      status: tokenRes.status,
      statusText: tokenRes.statusText,
      body: tokenResBody,
      redirect_uri: redirectUri,
      hasClientSecret: hasSecret,
    });
    let microsoftError = tokenResBody;
    try {
      const parsed = JSON.parse(tokenResBody) as { error_description?: string; error?: string };
      microsoftError = parsed.error_description ?? parsed.error ?? tokenResBody;
    } catch {
      // keep raw body
    }
    return { ok: false, error: microsoftError };
  }

  const tokens = JSON.parse(tokenResBody) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return { ok: true, tokens };
}

async function storeTokens(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  tokens: { access_token: string; refresh_token: string; expires_in: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error: upsertError } = await supabase.from('connections').upsert(
    {
      user_id: userId,
      provider: 'microsoft',
      connected: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  );
  if (upsertError) {
    console.error('Failed to store tokens:', upsertError.message);
    return { ok: false, error: 'Failed to store connection' };
  }
  return { ok: true };
}

function kickOffSyncs(supabaseUrl: string, serviceRoleKey: string, userId: string) {
  fetch(`${supabaseUrl}/functions/v1/outlook-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ initial_sync: true, user_id: userId }),
  });
  fetch(`${supabaseUrl}/functions/v1/outlook-calendar-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ user_id: userId }),
  });
}

async function requireUser(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ id: string } | { error: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { error: json({ error: 'Missing Authorization header' }, 401) };
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authError || !user) {
    console.error('Invalid session for outlook-auth:', authError?.message);
    return { error: json({ error: 'Invalid or expired session' }, 401) };
  }
  return { id: user.id };
}

function microsoftRedirectUri(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/outlook-auth`;
}

function isSafeAppRedirect(value: string): boolean {
  if (value.startsWith('tayloapp://') || value.startsWith('exp://')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function bounceToApp(appRedirect: string, params: Record<string, string>): Response {
  const usp = new URLSearchParams(params);
  const join = appRedirect.includes('?') ? '&' : '?';
  const href = `${appRedirect}${join}${usp.toString()}`;
  // Supabase rewrites text/html GET responses to text/plain, so a 302 is the
  // only reliable way back into the app from the in-app browser.
  return new Response(null, {
    status: 302,
    headers: {
      Location: href,
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function randomUrlToken(bytes: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

async function signState(payload: SignedState, secret: string): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

async function verifyState(raw: string, secret: string): Promise<SignedState> {
  const dot = raw.lastIndexOf('.');
  if (dot < 1) throw new Error('Malformed state');
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = await hmac(secret, body);
  if (sig !== expected) throw new Error('Bad state signature');
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SignedState;
  if (!payload.uid || !payload.verifier || !payload.appRedirect) throw new Error('Incomplete state');
  if (payload.exp < Date.now()) throw new Error('State expired');
  if (!isSafeAppRedirect(payload.appRedirect)) throw new Error('Unsafe redirect');
  return payload;
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(buf));
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
