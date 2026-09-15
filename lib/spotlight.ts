import { shouldRegenerateSpotlight } from '@/lib/placement';
import { supabase } from '@/lib/supabase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let inFlight: Promise<{ regenerated: boolean }> | null = null;

export type SpotlightCacheRow = {
  item_id: string | null;
  rank?: number | null;
  generated_at?: string | null;
};

export function latestSpotlightRows<T extends SpotlightCacheRow>(rows: T[]): T[] {
  if (!rows.length) return [];
  let latest = '';
  for (const row of rows) {
    const at = row.generated_at || '';
    if (at > latest) latest = at;
  }
  return rows.filter((row) => (row.generated_at || '') === latest);
}

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
  if (!session?.access_token || !session.user?.id || !supabaseUrl || !supabaseAnonKey) {
    return { regenerated: false };
  }

  if (!force) {
    const { data: spotlightRows } = await supabase
      .from('home_spotlight')
      .select('generated_at')
      .eq('user_id', session.user.id)
      .order('generated_at', { ascending: false })
      .limit(1);
    const generatedAt = (spotlightRows as { generated_at?: string | null }[] | null)?.[0]?.generated_at;
    if (!shouldRegenerateSpotlight({ generatedAt })) {
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
