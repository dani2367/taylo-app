import type { BusyDay } from './schedule';
import { fallbackDensityLine } from './schedule';
import { supabase } from '@/lib/supabase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

type CacheEntry = { fingerprint: string; insight: string; generatedAt: number };

let cache: CacheEntry | null = null;
let inFlight: Promise<{ insight: string | null; regenerated: boolean }> | null = null;
let inFlightKey = '';

export function cachedDensityInsight(fingerprint: string): string | null {
  if (!cache || cache.fingerprint !== fingerprint) return null;
  return cache.insight;
}

export async function refreshScheduleDensity(
  busy: BusyDay | null,
  opts?: { force?: boolean },
): Promise<{ insight: string | null; regenerated: boolean }> {
  if (!busy) return { insight: null, regenerated: false };
  const force = Boolean(opts?.force);
  const hit = !force ? cachedDensityInsight(busy.fingerprint) : null;
  if (hit) return { insight: hit, regenerated: false };

  const key = busy.fingerprint;
  if (inFlight && !force && inFlightKey === key) return inFlight;

  const run = doRefresh(busy, force);
  inFlightKey = key;
  inFlight = run.finally(() => {
    inFlight = null;
    inFlightKey = '';
  });
  return inFlight;
}

async function doRefresh(
  busy: BusyDay,
  force: boolean,
): Promise<{ insight: string | null; regenerated: boolean }> {
  const fallback = fallbackDensityLine(busy.weekday, busy.titles);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) {
    remember(busy.fingerprint, fallback, Date.now());
    return { insight: fallback, regenerated: false };
  }

  if (!force) {
    const stored = await readStoredDensity(busy.fingerprint);
    if (stored) {
      remember(busy.fingerprint, stored.insight, stored.generatedAt);
      return { insight: stored.insight, regenerated: false };
    }
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/taylo-schedule-density`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      force,
      weekday: busy.weekday,
      titles: busy.titles,
      busy_date: busy.ymd,
      fingerprint: busy.fingerprint,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    skipped?: boolean;
    insight?: string | null;
    generated_at?: string;
    error?: string;
  };
  if (!res.ok || !payload.success) {
    console.error('Schedule density refresh failed:', payload.error || res.status);
    remember(busy.fingerprint, fallback, Date.now());
    return { insight: fallback, regenerated: false };
  }

  const insight = (payload.insight || '').trim() || fallback;
  remember(
    busy.fingerprint,
    insight,
    payload.generated_at ? new Date(payload.generated_at).getTime() : Date.now(),
  );
  return { insight, regenerated: !payload.skipped };
}

async function readStoredDensity(
  fingerprint: string,
): Promise<{ insight: string; generatedAt: number } | null> {
  const { data } = await supabase
    .from('schedule_density_cache')
    .select('fingerprint, insight_text, generated_at')
    .maybeSingle();
  const row = data as { fingerprint?: string; insight_text?: string; generated_at?: string } | null;
  const insight = (row?.insight_text || '').trim();
  if (!row || row.fingerprint !== fingerprint || !insight) return null;
  return {
    insight,
    generatedAt: row.generated_at ? new Date(row.generated_at).getTime() : Date.now(),
  };
}

function remember(fingerprint: string, insight: string, generatedAt: number) {
  cache = { fingerprint, insight, generatedAt };
}
