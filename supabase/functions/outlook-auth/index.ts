import { createClient } from 'jsr:@supabase/supabase-js@2';

const TENANT_ID = '9db2fda9-4cfc-467e-9853-910fae5ccd4c';
const CLIENT_ID = 'f976566d-39c1-48bc-b140-e7a5a727afd5';
const TOKEN_ENDPOINT = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

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

    if (!supabaseUrl || !serviceRoleKey) {
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

    const body = await req.json();
    const { code, redirect_uri, code_verifier } = body as {
      code?: string;
      redirect_uri?: string;
      code_verifier?: string;
    };

    if (!code || !redirect_uri) {
      return json({ error: 'Missing code or redirect_uri' }, 400);
    }

    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      redirect_uri,
      grant_type: 'authorization_code',
      ...(code_verifier ? { code_verifier } : {}),
    });

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    const tokenResBody = await tokenRes.text();

    if (!tokenRes.ok) {
      console.error('Microsoft token exchange failed:', {
        status: tokenRes.status,
        statusText: tokenRes.statusText,
        headers: Object.fromEntries(tokenRes.headers.entries()),
        body: tokenResBody,
        tokenEndpoint: TOKEN_ENDPOINT,
        redirect_uri,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
      });
      return json({ error: 'Token exchange failed' }, 502);
    }

    const tokens = JSON.parse(tokenResBody) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: upsertError } = await supabase
      .from('connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'microsoft',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' },
      );

    if (upsertError) {
      console.error('Failed to store tokens:', upsertError.message);
      return json({ error: 'Failed to store connection' }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
