import { fallbackWeeklySummary, weekFingerprint } from './plan-family';
import { supabase } from '@/lib/supabase';

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
    remember(fingerprint, fallback, Date.now());
    return { summaries: fallback, regenerated: false };
  }

  if (!force) {
    const stored = await readStoredFamilyWeek(fingerprint);
    if (stored) {
      remember(fingerprint, stored.summaries, stored.generatedAt);
      return { summaries: stored.summaries, regenerated: false };
    }
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
    generated_at?: string;
    error?: string;
  };
  if (!res.ok || !payload.success) {
    console.error('Family week refresh failed:', payload.error || res.status);
    remember(fingerprint, fallback, Date.now());
    return { summaries: fallback, regenerated: false };
  }

  const summaries = { ...fallback, ...(payload.summaries || {}) };
  remember(
    fingerprint,
    summaries,
    payload.generated_at ? new Date(payload.generated_at).getTime() : Date.now(),
  );
  return { summaries, regenerated: !payload.skipped };
}

async function readStoredFamilyWeek(
  fingerprint: string,
): Promise<{ summaries: Record<string, string>; generatedAt: number } | null> {
  const { data } = await supabase
    .from('family_week_cache')
    .select('fingerprint, summaries, generated_at')
    .maybeSingle();
  const row = data as { fingerprint?: string; summaries?: unknown; generated_at?: string } | null;
  const summaries = parseSummaries(row?.summaries);
  if (!row || row.fingerprint !== fingerprint || !summaries) return null;
  return {
    summaries,
    generatedAt: row.generated_at ? new Date(row.generated_at).getTime() : Date.now(),
  };
}

function parseSummaries(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) out[id] = value.trim();
  }
  return Object.keys(out).length ? out : null;
}

function remember(fingerprint: string, summaries: Record<string, string>, generatedAt: number) {
  cache = { fingerprint, summaries, generatedAt };
}
