import { supabase } from '@/lib/supabase';

const STALE_MS = 4 * 60 * 60 * 1000;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let inFlight: Promise<{ regenerated: boolean }> | null = null;

export async function refreshSpotlight(opts?: { force?: boolean }): Promise<{ regenerated: boolean }> {
  const force = Boolean(opts?.force);
  if (inFlight && !force) return inFlight;

  const run = doRefresh(force);
  if (!inFlight) {
    inFlight = run.finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  return run;
}

async function doRefresh(force: boolean): Promise<{ regenerated: boolean }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) {
    return { regenerated: false };
  }

  if (!force) {
    const { data } = await supabase
      .from('home_spotlight')
      .select('generated_at')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const generatedAt = (data as { generated_at?: string } | null)?.generated_at;
    if (generatedAt && Date.now() - new Date(generatedAt).getTime() < STALE_MS) {
      return { regenerated: false };
    }
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/taylo-spotlight`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ force }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    skipped?: boolean;
    error?: string;
  };
  if (!res.ok || !payload.success) {
    console.error('Spotlight refresh failed:', payload.error || res.status);
    return { regenerated: false };
  }
  return { regenerated: !payload.skipped };
}
