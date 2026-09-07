/** Placement is derived only from typed fields. `source` is provenance, never a switch. */

export const HOME_ACTION_LIMIT = 3;
export const HOME_ACTION_MAX = 4;
export const HOME_SURFACED_COOLDOWN_MS = 18 * 60 * 60 * 1000;

export type ItemKind = 'occurrence' | 'obligation' | 'hold' | 'list_item' | 'context_only';
export type Confidence = 'high' | 'medium' | 'low';

export type PlacementItem = {
  id: string;
  title?: string | null;
  kind?: string | null;
  occurs_at?: string | null;
  due_at?: string | null;
  confidence?: string | null;
  surface_from?: string | null;
  surface_until?: string | null;
  status?: string | null;
  parent_id?: string | null;
  created_at?: string | null;
};

export type HomeSurfaced = {
  id: string;
  at: Date;
};

export function isOpenForSurfacing(status?: string | null): boolean {
  const value = (status || 'open').toLowerCase();
  return value !== 'done' && value !== 'dismissed' && value !== 'delegated';
}

export function dateOnly(raw?: string | null): string | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function todayYmd(today = new Date()): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSurfaceWindowOpen(item: PlacementItem, today = new Date()): boolean {
  const t = todayYmd(today);
  const from = dateOnly(item.surface_from);
  const until = dateOnly(item.surface_until);
  if (from && from > t) return false;
  if (until && until < t) return false;
  return true;
}

export function isSurfaceFromPending(item: PlacementItem, today = new Date()): boolean {
  const from = dateOnly(item.surface_from);
  return !!from && from > todayYmd(today);
}

export function isScheduleItem(item: PlacementItem): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  return item.kind === 'occurrence' && !!item.occurs_at;
}

/** Radar "Keeping an eye on": holds, or obligations not yet due / whose window has not opened. */
export function isRadarWatchItem(item: PlacementItem, today = new Date()): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  if (item.kind === 'hold') return true;
  if (item.kind !== 'obligation') return false;
  return item.due_at == null || isSurfaceFromPending(item, today);
}

export function isHomeEligible(item: PlacementItem, today = new Date()): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  if (item.kind !== 'obligation') return false;
  const confidence = (item.confidence || 'medium').toLowerCase();
  if (confidence === 'low') return false;
  if (confidence !== 'high' && confidence !== 'medium') return false;
  return isSurfaceWindowOpen(item, today);
}

export function isListBound(item: PlacementItem, byId: Map<string, PlacementItem>): boolean {
  if (item.kind === 'list_item') return true;
  const parent = item.parent_id ? byId.get(item.parent_id) : undefined;
  return parent?.kind === 'list_item';
}

export type PlacementCard<T extends PlacementItem = PlacementItem> = {
  item: T;
  children: T[];
};

/** Fold child obligations into their parent so "Water bottle" is not a lone card. List-bound rows stay in lists. */
export function groupUnderParents<T extends PlacementItem>(
  items: T[],
  eligible: T[],
): PlacementCard<T>[] {
  const byId = new Map(items.map((row) => [row.id, row]));
  const groups = new Map<string, PlacementCard<T>>();

  function takeParent(parent: T): PlacementCard<T> | null {
    if (parent.kind === 'list_item') return null;
    const existing = groups.get(parent.id);
    if (existing) return existing;
    const created: PlacementCard<T> = { item: parent, children: [] };
    groups.set(parent.id, created);
    return created;
  }

  for (const row of eligible) {
    if (isListBound(row, byId)) continue;
    if (row.parent_id) {
      const parent = byId.get(row.parent_id);
      if (parent) takeParent(parent);
      continue;
    }
    takeParent(row);
  }

  for (const row of items) {
    if (!row.parent_id || !isOpenForSurfacing(row.status)) continue;
    const group = groups.get(row.parent_id);
    if (!group) continue;
    if (group.children.some((child) => child.id === row.id)) continue;
    group.children.push(row);
  }

  return [...groups.values()];
}

export function selectRadarWatch<T extends PlacementItem>(items: T[], today = new Date()): PlacementCard<T>[] {
  const eligible = items.filter((item) => isRadarWatchItem(item, today));
  return groupUnderParents(items, eligible).sort((a, b) => compareRadarWatch(a.item, b.item));
}

/**
 * Family is a people lens over the full table, not a Home/Radar subset.
 * Occurrences, obligations, holds, and other non-list rows all qualify.
 */
export function isFamilyVisible(item: PlacementItem): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  return item.kind !== 'list_item';
}

export function compareRadarWatch(a: PlacementItem, b: PlacementItem): number {
  const ca = a.created_at ? Date.parse(a.created_at) : 0;
  const cb = b.created_at ? Date.parse(b.created_at) : 0;
  if (ca !== cb) return cb - ca;
  return (a.title || '').localeCompare(b.title || '');
}

function dueSortKey(item: PlacementItem): string {
  return dateOnly(item.due_at) || '9999-12-31';
}

export function compareHomeActions(a: PlacementItem, b: PlacementItem): number {
  const due = dueSortKey(a).localeCompare(dueSortKey(b));
  if (due !== 0) return due;
  const ca = a.created_at ? Date.parse(a.created_at) : 0;
  const cb = b.created_at ? Date.parse(b.created_at) : 0;
  if (ca !== cb) return cb - ca;
  return (a.title || '').localeCompare(b.title || '');
}

export function recentlySurfacedIds(
  previous: HomeSurfaced[],
  now = new Date(),
  cooldownMs = HOME_SURFACED_COOLDOWN_MS,
): Set<string> {
  const ids = new Set<string>();
  for (const row of previous) {
    if (now.getTime() - row.at.getTime() < cooldownMs) ids.add(row.id);
  }
  return ids;
}

/** Rank then cap (2–4) as grouped parent cards. UI must render this list as-is — do not slice again. */
export function selectHomeActions<T extends PlacementItem>(
  items: T[],
  opts?: {
    today?: Date;
    previouslySurfaced?: HomeSurfaced[];
    pinnedIds?: string[];
    limit?: number;
  },
): PlacementCard<T>[] {
  const today = opts?.today ?? new Date();
  const cap = Math.min(HOME_ACTION_MAX, Math.max(1, opts?.limit ?? HOME_ACTION_LIMIT));
  const eligible = items.filter((item) => isHomeEligible(item, today));
  const grouped = groupUnderParents(items, eligible);
  const pinned = new Set((opts?.pinnedIds ?? []).filter(Boolean));
  const sortKey = (card: PlacementCard<T>): T => {
    if (card.item.kind === 'occurrence' && card.children[0]) return card.children[0];
    return card.item;
  };
  const compare = (a: PlacementCard<T>, b: PlacementCard<T>) => compareHomeActions(sortKey(a), sortKey(b));
  if (pinned.size) {
    const keep = grouped.filter((card) => pinned.has(card.item.id)).sort(compare);
    const fill = grouped.filter((card) => !pinned.has(card.item.id)).sort(compare);
    return [...keep, ...fill].slice(0, cap);
  }
  const recent = recentlySurfacedIds(opts?.previouslySurfaced ?? [], today);
  const preferred = grouped.filter((card) => !recent.has(card.item.id)).sort(compare);
  const rest = grouped.filter((card) => recent.has(card.item.id)).sort(compare);
  return [...preferred, ...rest].slice(0, cap);
}

export function childStandaloneTitle(
  childTitle: string | null | undefined,
  parent: { title?: string | null; when?: string | null } | null | undefined,
): string {
  const title = (childTitle || '').trim() || 'Untitled';
  const parentTitle = (parent?.title || '').trim();
  if (!parentTitle) return title;
  const when = (parent?.when || '').trim();
  if (when) return `${title} — ${parentTitle} is ${when}`;
  return `${title} — ${parentTitle}`;
}
