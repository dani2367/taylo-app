import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const MICROSOFT_TOKEN_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token';
export const MICROSOFT_CLIENT_ID = 'f976566d-39c1-48bc-b140-e7a5a727afd5';

export function applyMicrosoftClientAuth(params: URLSearchParams) {
  const secret = Deno.env.get('MICROSOFT_CLIENT_SECRET')?.trim();
  if (secret) params.set('client_secret', secret);
}

const REFRESH_SKEW_MS = 5 * 60 * 1000;

export type MicrosoftConnection = {
  user_id: string;
  refresh_token: string;
  access_token?: string | null;
  expires_at?: string | null;
};

export async function getFreshMicrosoftAccessToken(
  supabase: SupabaseClient,
  connection: MicrosoftConnection,
): Promise<string> {
  const stored = connection.access_token?.trim();
  const expiresAt = connection.expires_at ? Date.parse(connection.expires_at) : NaN;
  if (stored && !Number.isNaN(expiresAt) && expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return stored;
  }
  return refreshMicrosoftAccessToken(supabase, connection.user_id, connection.refresh_token);
}

export async function refreshMicrosoftAccessToken(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string,
): Promise<string> {
  // Do not send `scope` on refresh. Microsoft treats token-request scopes as a
  // re-authorization; extra or mismatched scopes cause AADSTS70000 for personal accounts.
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: MICROSOFT_CLIENT_ID,
    refresh_token: refreshToken,
  });
  applyMicrosoftClientAuth(params);

  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const body = await res.text();
  console.log('Microsoft token refresh status:', res.status);

  if (!res.ok) {
    let microsoftError = body.slice(0, 400);
    try {
      const parsed = JSON.parse(body) as { error?: string; error_description?: string };
      microsoftError = parsed.error_description ?? parsed.error ?? microsoftError;
    } catch {
      // keep raw body
    }
    console.error('Microsoft token refresh failed:', { userId, status: res.status, microsoftError });
    if (res.status === 400) {
      await markMicrosoftDisconnected(supabase, userId);
    }
    throw new Error(`Microsoft token refresh failed (${res.status})`);
  }

  const tokens = JSON.parse(body) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const update: {
    access_token: string;
    expires_at: string;
    updated_at: string;
    refresh_token?: string;
  } = {
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

async function markMicrosoftDisconnected(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase
    .from('connections')
    .update({
      connected: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'microsoft');
  if (error) {
    console.error('Failed to mark Microsoft connection disconnected:', userId, error.message);
    return;
  }
  console.warn('Marked Microsoft connection disconnected after failed refresh:', userId);
}
