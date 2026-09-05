import type { BusyDay } from './schedule';
import { fallbackDensityLine } from './schedule';
import { supabase } from '@/lib/supabase';

const STALE_MS = 4 * 60 * 60 * 1000;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

type CacheEntry = { fingerprint: string; insight: string; generatedAt: number };

let cache: CacheEntry | null = null;
let inFlight: Promise<{ insight: string | null; regenerated: boolean }> | null = null;
let inFlightKey = '';

export function cachedDensityInsight(fingerprint: string): string | null {
  if (!cache || cache.fingerprint !== fingerprint) return null;
  if (Date.now() - cache.generatedAt >= STALE_MS) return null;
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) {
    const fallback = fallbackDensityLine(busy.weekday, busy.titles);
    cache = { fingerprint: busy.fingerprint, insight: fallback, generatedAt: Date.now() };
    return { insight: fallback, regenerated: false };
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
    error?: string;
  };
  if (!res.ok || !payload.success) {
    console.error('Schedule density refresh failed:', payload.error || res.status);
    const fallback = fallbackDensityLine(busy.weekday, busy.titles);
    cache = { fingerprint: busy.fingerprint, insight: fallback, generatedAt: Date.now() };
    return { insight: fallback, regenerated: false };
  }

  const insight = (payload.insight || '').trim() || fallbackDensityLine(busy.weekday, busy.titles);
  cache = { fingerprint: busy.fingerprint, insight, generatedAt: Date.now() };
  return { insight, regenerated: !payload.skipped };
}
