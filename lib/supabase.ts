import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Add them to your .env file.',
  );
}

function jwtSkewMessage(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as { message?: unknown; error?: unknown };
  const message = [record.message, record.error]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return message.includes('jwt issued at future');
}

/** Auth can mint a token a second before PostgREST’s clock will accept it. */
async function fetchWithJwtSkewRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(input, init);
    if (attempt === maxAttempts) return response;
    try {
      const payload: unknown = await response.clone().json();
      if (!jwtSkewMessage(payload)) return response;
    } catch {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
  return fetch(input, init);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithJwtSkewRetry },
});
