import { fallbackWeeklySummary, weekFingerprint } from './plan-family';
import { supabase } from '@/lib/supabase';

const STALE_MS = 4 * 60 * 60 * 1000;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export type FamilyWeekPerson = { id: string; name: string; titles: string[] };

type CacheEntry = {
  fingerprint: string;
  summaries: Record<string, string>;
  generatedAt: number;
};

let cache: CacheEntry | null = null;
let inFlight: Promise<{ summaries: Record<string, string>; regenerated: boolean }> | null = null;
let inFlightKey = '';

export function cachedFamilyWeek(fingerprint: string): Record<string, string> | null {
  if (!cache || cache.fingerprint !== fingerprint) return null;
  if (Date.now() - cache.generatedAt >= STALE_MS) return null;
  return cache.summaries;
}

export function localFamilyWeekSummaries(people: FamilyWeekPerson[]): Record<string, string> {
  const summaries: Record<string, string> = {};
  for (const person of people) {
    summaries[person.id] = fallbackWeeklySummary(person.name, person.titles);
  }
  return summaries;
}

export async function refreshFamilyWeek(
  weekStart: string,
  people: FamilyWeekPerson[],
  opts?: { force?: boolean },
): Promise<{ summaries: Record<string, string>; regenerated: boolean }> {
  const force = Boolean(opts?.force);
  const fingerprint = weekFingerprint(
    weekStart,
    people.map((person) => ({ id: person.id, titles: person.titles })),
  );
  const hit = !force ? cachedFamilyWeek(fingerprint) : null;
  if (hit) return { summaries: hit, regenerated: false };

  if (inFlight && !force && inFlightKey === fingerprint) return inFlight;

  const run = doRefresh(weekStart, people, fingerprint, force);
  inFlightKey = fingerprint;
  inFlight = run.finally(() => {
    inFlight = null;
    inFlightKey = '';
  });
  return inFlight;
}

async function doRefresh(
  weekStart: string,
  people: FamilyWeekPerson[],
  fingerprint: string,
  force: boolean,
): Promise<{ summaries: Record<string, string>; regenerated: boolean }> {
  const fallback = localFamilyWeekSummaries(people);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) {
    cache = { fingerprint, summaries: fallback, generatedAt: Date.now() };
    return { summaries: fallback, regenerated: false };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/taylo-family-week`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ force, week_start: weekStart, fingerprint, people }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    skipped?: boolean;
    summaries?: Record<string, string>;
    error?: string;
  };
  if (!res.ok || !payload.success) {
    console.error('Family week refresh failed:', payload.error || res.status);
    cache = { fingerprint, summaries: fallback, generatedAt: Date.now() };
    return { summaries: fallback, regenerated: false };
  }

  const summaries = { ...fallback, ...(payload.summaries || {}) };
  cache = { fingerprint, summaries, generatedAt: Date.now() };
  return { summaries, regenerated: !payload.skipped };
}
