import { isActiveCollection } from '@/lib/collections';
import {
  HOME_OVERFLOW_RANK_BASE,
  HOME_RADAR_LOAD_KINDS,
  HOME_SURFACED_COOLDOWN_MS,
  orderHomeSpotlightQueue,
  shouldRegenerateSpotlight,
  type HomeSurfaced,
  type PlacementItem,
} from '@/lib/placement';
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

  const userId = session.user.id;
  const [{ data: spotlightRows }, { data: itemRows }] = await Promise.all([
    supabase
      .from('home_spotlight')
      .select('item_id, generated_at, rank')
      .eq('user_id', userId)
      .order('rank', { ascending: true }),
    supabase
      .from('items')
      .select(
        'id, title, kind, confidence, due_at, occurs_at, event_date, surface_from, surface_until, parent_id, created_at, status, collections(status), parent:items!parent_id(id, title, kind, occurs_at, event_date, due_at)',
      )
      .eq('user_id', userId)
      .eq('status', 'open')
      .in('kind', [...HOME_RADAR_LOAD_KINDS]),
  ]);

  const cache = latestSpotlightRows((spotlightRows as SpotlightCacheRow[] | null) ?? []);
  const generatedAtRaw = cache[0]?.generated_at;
  const generatedAt = generatedAtRaw ? new Date(generatedAtRaw) : null;
  const cachedHomeIds = cache
    .filter((row) => (row.rank ?? 0) < HOME_OVERFLOW_RANK_BASE)
    .map((row) => row.item_id)
    .filter((id): id is string => !!id);
  const cachedOverflowIds = cache
    .filter((row) => (row.rank ?? 0) >= HOME_OVERFLOW_RANK_BASE)
    .map((row) => row.item_id)
    .filter((id): id is string => !!id);
  const now = new Date();
  const previouslySurfaced: HomeSurfaced[] =
    generatedAt && now.getTime() - generatedAt.getTime() < HOME_SURFACED_COOLDOWN_MS
      ? cachedHomeIds.map((id) => ({ id, at: generatedAt }))
      : [];

  const items = (
    (itemRows as (PlacementItem & {
      collections?: { status?: string | null } | { status?: string | null }[] | null;
    })[] | null) ?? []
  ).filter((item) => isActiveCollection(item.collections));
  const { home, overflow } = orderHomeSpotlightQueue(items, {
    today: now,
    previouslySurfaced,
  });

  const setDiffers = shouldRegenerateSpotlight({
    generatedAt,
    cachedIds: cachedHomeIds,
    rankedIds: home.map((card) => card.item.id),
    cachedOverflowIds,
    overflowIds: overflow.map((card) => card.item.id),
    now,
  });
  if (!force && !setDiffers) {
    return { regenerated: false };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/taylo-spotlight`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ force: force || setDiffers }),
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
