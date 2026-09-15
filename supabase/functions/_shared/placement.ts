/** Placement is derived only from typed fields. `source` is provenance, never a switch. */

/** Home visibility cap. Extra relevant actions go to See all (oldest-on-Home first). */
export const HOME_VISIBLE_MAX = 5;
export const HOME_ACTION_MAX = HOME_VISIBLE_MAX;
export const HOME_ACTION_LIMIT = HOME_VISIBLE_MAX;
export const HOME_NEAR_TERM_DAYS = 7;
/** Spotlight ranks below this are Home; See all reads rank >= this. */
export const HOME_OVERFLOW_RANK_BASE = 1000;
export const HOME_SURFACED_COOLDOWN_MS = 18 * 60 * 60 * 1000;
export const SPOTLIGHT_STALE_MS = 4 * 60 * 60 * 1000;
/** Load these kinds so parent lookup works even when the parent itself is never surfaced. */
export const HOME_RADAR_LOAD_KINDS = ['obligation', 'occurrence', 'hold', 'context_only', 'list_item'] as const;

export type ItemKind = 'occurrence' | 'obligation' | 'hold' | 'list_item' | 'context_only';
export type Confidence = 'high' | 'medium' | 'low';

export type PlacementParentRef = {
  title?: string | null;
  kind?: string | null;
  status?: string | null;
  collection_id?: string | null;
  occurs_at?: string | null;
  event_date?: string | null;
  due_at?: string | null;
};

export type PlacementItem = {
  id: string;
  title?: string | null;
  kind?: string | null;
  occurs_at?: string | null;
  event_date?: string | null;
  due_at?: string | null;
  confidence?: string | null;
  surface_from?: string | null;
  surface_until?: string | null;
  status?: string | null;
  parent_id?: string | null;
  collection_id?: string | null;
  created_at?: string | null;
  parent?: PlacementParentRef | PlacementParentRef[] | null;
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

/** Real calendar occurrences — timed or all-day events they attend. */
export function isOccurrenceOnSchedule(item: PlacementItem): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  return item.kind === 'occurrence' && !!item.occurs_at;
}

/**
 * Narrow Schedule carve-out: a context_only row with occurs_at already set
 * (ingest only writes that for high-confidence stated facts).
 * Shows on the day timeline (Home and Plan) as a note, never as a Home action.
 */
export function isInformationalOnSchedule(item: PlacementItem): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  if (item.kind !== 'context_only') return false;
  if ((item.confidence || '').toLowerCase() !== 'high') return false;
  return !!item.occurs_at;
}

export function isScheduleItem(item: PlacementItem): boolean {
  return isOccurrenceOnSchedule(item) || isInformationalOnSchedule(item);
}

function parentAnchorDate(item: PlacementItem): string | null {
  const parent = unwrapPlacementParent(item.parent);
  return dateOnly(parent?.occurs_at || parent?.event_date || null);
}

/** Child leftover after the parent's day — still open, so it should get more prominent, not sit as "no rush". */
export function isObligationOverdueAgainstParent(item: PlacementItem, today = new Date()): boolean {
  if (item.kind !== 'obligation') return false;
  const when = parentAnchorDate(item);
  if (!when) return false;
  return when < todayYmd(today);
}

function closedParentStatus(
  item: PlacementItem,
  byId?: Map<string, PlacementItem>,
): boolean {
  if (!item.parent_id) return false;
  const live = byId?.get(item.parent_id);
  if (live) return !isOpenForSurfacing(live.status);
  const embed = unwrapPlacementParent(item.parent);
  if (embed?.status) return !isOpenForSurfacing(embed.status);
  // Parent is not in the open table (dismissed/done and therefore not loaded).
  return !!byId;
}

/** Dismissing / completing a parent always closes its children — they must not stay open. */
export function isChildOfClosedParent(
  item: PlacementItem,
  byId?: Map<string, PlacementItem>,
): boolean {
  return closedParentStatus(item, byId);
}

/** "Card" / "Present" leftover lines — never their own Home or Radar cards. */
export function isBarePrepTitle(title?: string | null): boolean {
  const value = (title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return /^(a |the )?(card|present|gift)s?$/.test(value);
}

export function isBarePrepChild(item: PlacementItem): boolean {
  return item.kind === 'obligation' && !!item.parent_id && isBarePrepTitle(item.title);
}

/** Kit to bring on the day — not its own Home card. Folds into a this-week parent card, or Radar if the event is further out. */
export function isEventKitTitle(title?: string | null): boolean {
  return /\b(packed lunch|waterproof|wellies|wellingtons|water bottle|named (towel|bottle)|towel|goggles|costume|swimsuit|swim suit|bobble|hair (band|tie)|socks|sun cream|sunhat|sun hat)\b/i.test(
    title || '',
  );
}

export function isAdminActionTitle(title?: string | null): boolean {
  return /\b(form|permission|slip|consent|rsvp|confirm attendance|invoice|payment)\b/i.test(title || '');
}

function isPackingChildOfParent(item: PlacementItem, today = new Date()): boolean {
  const parent = unwrapPlacementParent(item.parent);
  const parentKind = parent?.kind;
  if (!item.parent_id || !parentKind) return false;
  if (
    parentKind !== 'obligation' &&
    parentKind !== 'hold' &&
    parentKind !== 'occurrence' &&
    parentKind !== 'context_only'
  ) {
    return false;
  }
  if (isAdminActionTitle(item.title)) return false;
  if (item.due_at == null || isSurfaceFromPending(item, today)) return true;
  return isEventKitTitle(item.title);
}

/** Radar "Keeping an eye on": holds, or obligations not yet due / whose window has not opened. */
export function isRadarWatchItem(
  item: PlacementItem,
  today = new Date(),
  byId?: Map<string, PlacementItem>,
): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  if (closedParentStatus(item, byId)) return false;
  if (isBarePrepChild(item)) return false;
  if (item.kind === 'hold') return true;
  if (item.kind !== 'obligation') return false;
  if (isPackingChildOfParent(item, today)) {
    const parent = unwrapPlacementParent(item.parent);
    // The hold is the card. An undated "buy a new X" child is the same awareness.
    if (parent?.kind === 'hold') return false;
    return true;
  }
  if (isObligationOverdueAgainstParent(item, today)) return false;
  return item.due_at == null || isSurfaceFromPending(item, today);
}

export function isHomeEligible(
  item: PlacementItem,
  today = new Date(),
  byId?: Map<string, PlacementItem>,
): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  if (item.kind !== 'obligation') return false;
  if (closedParentStatus(item, byId)) return false;
  if (isBarePrepChild(item)) return false;
  const confidence = (item.confidence || 'medium').toLowerCase();
  if (confidence === 'low') return false;
  if (confidence !== 'high' && confidence !== 'medium') return false;
  if (isPackingChildOfParent(item, today)) return false;
  if (isObligationOverdueAgainstParent(item, today)) return true;
  return isSurfaceWindowOpen(item, today);
}

/** Dated obligations that belong on the Home spotlight bar (before the 5-card visibility cap). */
export function isHomeSpotlightItem(
  item: PlacementItem,
  today = new Date(),
  byId?: Map<string, PlacementItem>,
): boolean {
  if (!isHomeEligible(item, today, byId)) return false;
  return isDueTodayOrOverdue(item, today) || isNearTermDue(item, today);
}

export function isListBound(item: PlacementItem, byId: Map<string, PlacementItem>): boolean {
  if (item.kind === 'list_item') return true;
  if (item.collection_id) return true;
  const live = item.parent_id ? byId.get(item.parent_id) : undefined;
  const embed = unwrapPlacementParent(item.parent);
  if (live?.collection_id || embed?.collection_id) return true;
  const parentKind = live?.kind || embed?.kind;
  if (parentKind !== 'list_item') return false;
  // A list hub with no collection is leftover after the list was removed — let children surface.
  if (live && (live.collection_id == null || live.collection_id === '')) return false;
  return true;
}

export type PlacementCard<T extends PlacementItem = PlacementItem> = {
  item: T;
  children: T[];
};

export function unwrapPlacementParent(
  raw: PlacementItem['parent'],
): PlacementParentRef | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

/** Parent title for child copy — from the full items table, not the eligible subset. */
export function lookupParent<T extends PlacementItem>(item: T, byId: Map<string, T>): T | undefined {
  if (!item.parent_id) return undefined;
  return byId.get(item.parent_id);
}

function withLookedUpParent<T extends PlacementItem>(item: T, byId: Map<string, T>): T {
  if (!item.parent_id) return item;
  const existing = unwrapPlacementParent(item.parent);
  const parent = lookupParent(item, byId);
  const title = existing?.title || parent?.title;
  const occurs_at = existing?.occurs_at || parent?.occurs_at;
  const event_date = existing?.event_date ?? parent?.event_date ?? null;
  if (!title && !occurs_at && !event_date) return item;
  return {
    ...item,
    parent: {
      title,
      kind: existing?.kind || parent?.kind,
      status: existing?.status || parent?.status,
      collection_id: existing?.collection_id ?? parent?.collection_id ?? null,
      occurs_at,
      event_date,
      due_at: existing?.due_at ?? parent?.due_at ?? null,
    },
  };
}

/**
 * Each eligible row is its own card. Parents (including context_only / occurrence)
 * are used only for list-bound checks and display-title lookup — never as a wrapper.
 * Home uses this. Radar grouping is separate (`asRadarWatchCards`).
 */
export function asStandaloneCards<T extends PlacementItem>(
  items: T[],
  eligible: T[],
): PlacementCard<T>[] {
  const byId = new Map(items.map((row) => [row.id, row]));
  const cards: PlacementCard<T>[] = [];
  for (const row of eligible) {
    if (isListBound(row, byId)) continue;
    cards.push({ item: withLookedUpParent(row, byId), children: [] });
  }
  return cards;
}

function isNearTermEvent(item: PlacementItem, today: Date): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  if (item.kind !== 'context_only' && item.kind !== 'occurrence') return false;
  const due =
    actionDueDay(item, today) ||
    dueDayFromTimestamp(item.occurs_at) ||
    dateOnly(item.occurs_at);
  if (!due) return false;
  return due <= addDaysYmd(todayYmd(today), HOME_NEAR_TERM_DAYS);
}

function homeClusterChildren<T extends PlacementItem>(
  parent: T,
  items: T[],
  byId: Map<string, T>,
): T[] {
  return items.filter((row) => {
    if (row.parent_id !== parent.id) return false;
    if (!isOpenForSurfacing(row.status)) return false;
    if (row.kind !== 'obligation') return false;
    if ((row.confidence || 'medium').toLowerCase() === 'low') return false;
    if (isListBound(row, byId)) return false;
    if (isBarePrepChild(row)) return false;
    return true;
  });
}

/**
 * Needed-now cluster: one Home card for the parent, checklist of open children.
 * This-week gala + medical form + kit. Farm slip + packed lunch.
 * Not a far RSVP, and not invented interview prep with no admin action.
 */
export function asHomeNeededNowCards<T extends PlacementItem>(
  items: T[],
  today = new Date(),
): PlacementCard<T>[] {
  const hydrated = hydrateParents(items);
  const byId = new Map(hydrated.map((row) => [row.id, row]));
  const cards: PlacementCard<T>[] = [];
  for (const parent of hydrated) {
    if (parent.parent_id) continue;
    if (isListBound(parent, byId)) continue;
    const children = homeClusterChildren(parent, hydrated, byId);
    if (!children.length) continue;
    const spotlightKids = children.filter((row) => isHomeSpotlightItem(row, today, byId));
    const packingKids = children.filter((row) => isPackingChildOfParent(row, today));
    const parentDue = isHomeSpotlightItem(parent, today, byId);
    const eventSoon = isNearTermEvent(parent, today);
    if (parentDue && packingKids.length) {
      cards.push({ item: withLookedUpParent(parent, byId), children });
      continue;
    }
    if (eventSoon && spotlightKids.length) {
      cards.push({ item: withLookedUpParent(parent, byId), children });
    }
  }
  return cards;
}

function hydrateParents<T extends PlacementItem>(items: T[]): T[] {
  const byId = new Map(items.map((row) => [row.id, row]));
  return items.map((row) => withLookedUpParent(row, byId));
}

function isRadarGroupParent(parent: PlacementItem): boolean {
  if (parent.kind === 'list_item') {
    return parent.collection_id == null || parent.collection_id === '';
  }
  return !!parent.kind || !!parent.title;
}

/** Parent for Radar grouping — only a live open row. Dismissed/done parents stay off Radar. */
function groupingParent<T extends PlacementItem>(row: T, byId: Map<string, T>): T | undefined {
  if (!row.parent_id) return undefined;
  const live = byId.get(row.parent_id);
  if (!live || !isOpenForSurfacing(live.status)) return undefined;
  return live;
}

/** Events keep their work nested even when there is only one line — same shape as Schedule. */
function nestsRadarWork(parent: PlacementItem): boolean {
  return parent.kind === 'occurrence' || parent.kind === 'context_only';
}

/**
 * Radar nests watch children under their shared parent (occurrence,
 * obligation, hold, or context_only). Event parents keep a nested list even
 * for one child. Kit under a form still needs 2+ lines to collapse. Home never uses this.
 */
export function asRadarWatchCards<T extends PlacementItem>(
  items: T[],
  eligible: T[],
): PlacementCard<T>[] {
  const byId = new Map(items.map((row) => [row.id, row]));
  const grouped = new Map<string, T[]>();
  const singles: T[] = [];

  for (const row of eligible) {
    if (isListBound(row, byId)) continue;
    if (isBarePrepChild(row)) continue;
    if (closedParentStatus(row, byId)) continue;
    const parent = groupingParent(row, byId);
    if (row.parent_id && parent && isRadarGroupParent(parent)) {
      const bucket = grouped.get(row.parent_id) ?? [];
      bucket.push(withLookedUpParent(row, byId));
      grouped.set(row.parent_id, bucket);
      continue;
    }
    singles.push(withLookedUpParent(row, byId));
  }

  const groupedCards: PlacementCard<T>[] = [];
  const groupedParentIds = new Set<string>();
  const foldedChildIds = new Set<string>();
  for (const [parentId, children] of grouped) {
    const parent = byId.get(parentId);
    if (!parent) {
      for (const child of children) groupedCards.push({ item: child, children: [] });
      continue;
    }
    if (children.length < 2 && !nestsRadarWork(parent)) {
      groupedCards.push({ item: children[0]!, children: [] });
      continue;
    }
    groupedParentIds.add(parentId);
    for (const child of children) foldedChildIds.add(child.id);
    groupedCards.push({ item: parent, children });
  }
  const singlesCards = singles
    .filter((item) => !groupedParentIds.has(item.id) && !foldedChildIds.has(item.id))
    .map((item) => ({ item, children: [] as T[] }));
  return [...singlesCards, ...groupedCards];
}

function radarWatchSortItem<T extends PlacementItem>(card: PlacementCard<T>): T {
  if (!card.children.length) return card.item;
  return card.children.reduce((newest, row) => {
    const a = row.created_at ? Date.parse(row.created_at) : 0;
    const b = newest.created_at ? Date.parse(newest.created_at) : 0;
    return a > b ? row : newest;
  }, card.children[0]!);
}

export function selectRadarWatch<T extends PlacementItem>(items: T[], today = new Date()): PlacementCard<T>[] {
  const hydrated = hydrateParents(items);
  const byId = new Map(hydrated.map((row) => [row.id, row]));
  const homeCovered = new Set<string>();
  for (const card of selectHomeActions(hydrated, { today })) {
    homeCovered.add(card.item.id);
    for (const child of card.children) homeCovered.add(child.id);
  }
  const eligible = hydrated.filter((item) => {
    if (homeCovered.has(item.id)) return false;
    if (isRadarWatchItem(item, today, byId)) return true;
    // Far-dated Home-eligible leftovers stay on Plan as Radar, not Family-only.
    return isHomeEligible(item, today, byId);
  });
  return asRadarWatchCards(hydrated, eligible).sort((a, b) =>
    compareRadarWatch(radarWatchSortItem(a), radarWatchSortItem(b)),
  );
}

/** Drop Radar cards already on Home. A needed-now cluster on Home is not also a Radar group. */
export function exceptHomeActions<T extends PlacementItem>(
  watch: PlacementCard<T>[],
  home: PlacementCard<T>[],
): PlacementCard<T>[] {
  const homeIds = new Set(home.map((card) => card.item.id));
  const homeCovered = new Set(homeIds);
  for (const card of home) {
    for (const child of card.children) homeCovered.add(child.id);
  }
  const out: PlacementCard<T>[] = [];
  for (const card of watch) {
    if (homeCovered.has(card.item.id) && card.children.length) continue;
    if (card.children.length) {
      const remaining = card.children.filter((child) => !homeCovered.has(child.id));
      if (!remaining.length) continue;
      if (remaining.length >= 2 || nestsRadarWork(card.item)) {
        out.push({ item: card.item, children: remaining });
      } else {
        out.push({ item: remaining[0]!, children: [] });
      }
      continue;
    }
    if (!homeCovered.has(card.item.id)) out.push(card);
  }
  return out;
}

/**
 * Family is a people lens over Plan, not a third inbox.
 * A row belongs here only if it already has a Home, Radar, or Schedule home —
 * or it is dated context (the event the children hang off).
 */
export function isFamilyVisible(item: PlacementItem, today = new Date()): boolean {
  if (!isOpenForSurfacing(item.status)) return false;
  if (item.kind === 'list_item') return false;
  if (isHomeEligible(item, today) || isRadarWatchItem(item, today) || isScheduleItem(item)) return true;
  if (item.kind === 'context_only') {
    return !!(dateOnly(item.occurs_at) || dateOnly(item.event_date));
  }
  return false;
}

export function compareRadarWatch(a: PlacementItem, b: PlacementItem): number {
  const ca = a.created_at ? Date.parse(a.created_at) : 0;
  const cb = b.created_at ? Date.parse(b.created_at) : 0;
  if (ca !== cb) return cb - ca;
  return (a.title || '').localeCompare(b.title || '');
}

function dueSortKey(item: PlacementItem): string {
  return actionDueDay(item) || '9999-12-31';
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

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((part) => Number(part));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return todayYmd(dt);
}

/** Calendar day for ranking: event_date if present, else due_at (local day for timestamps). */
export function actionDueDay(item: PlacementItem, today = new Date()): string | null {
  const eventDay = dateOnly(item.event_date);
  if (eventDay)   return eventDay;
  return dueDayFromTimestamp(item.due_at);
}

function dueDayFromTimestamp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/T|\d{2}:\d{2}/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return todayYmd(parsed);
  }
  return dateOnly(raw);
}

export function isNearTermDue(item: PlacementItem, today = new Date()): boolean {
  const due = actionDueDay(item, today);
  if (!due) return false;
  return due <= addDaysYmd(todayYmd(today), HOME_NEAR_TERM_DAYS);
}

export function isDueTodayOrOverdue(item: PlacementItem, today = new Date()): boolean {
  const due = actionDueDay(item, today);
  if (!due) return false;
  return due <= todayYmd(today);
}

/** Near-term high-confidence, or anything due today/overdue — may bump or take the 4th slot. */
export function isHomeOverflowCandidate(item: PlacementItem, today = new Date()): boolean {
  if (!isNearTermDue(item, today)) return false;
  if (isDueTodayOrOverdue(item, today)) return true;
  return (item.confidence || '').toLowerCase() === 'high';
}

export function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  return b.every((id) => seen.has(id));
}

export function isSpotlightTimeStale(
  generatedAt: Date | null | undefined,
  now = new Date(),
  staleMs = SPOTLIGHT_STALE_MS,
): boolean {
  if (!generatedAt) return true;
  return now.getTime() - generatedAt.getTime() >= staleMs;
}

export function shouldRegenerateSpotlight(opts: {
  generatedAt?: Date | null;
  cachedIds: string[];
  rankedIds: string[];
  cachedOverflowIds?: string[];
  overflowIds?: string[];
  now?: Date;
}): boolean {
  if (isSpotlightTimeStale(opts.generatedAt, opts.now)) return true;
  if (!sameIdSet(opts.cachedIds, opts.rankedIds)) return true;
  if (opts.overflowIds) {
    return !sameIdSet(opts.cachedOverflowIds ?? [], opts.overflowIds);
  }
  return false;
}

function rankHomeEligibleCards<T extends PlacementItem>(
  items: T[],
  opts?: {
    today?: Date;
    previouslySurfaced?: HomeSurfaced[];
    pinnedIds?: string[];
  },
): { today: Date; ranked: PlacementCard<T>[] } {
  const today = opts?.today ?? new Date();
  const hydrated = hydrateParents(items);
  const byId = new Map(hydrated.map((row) => [row.id, row]));
  const eligible = hydrated.filter((item) => isHomeEligible(item, today, byId));
  const standalone = asStandaloneCards(hydrated, eligible);
  const compare = (a: PlacementCard<T>, b: PlacementCard<T>) => compareHomeActions(a.item, b.item);
  const recent = recentlySurfacedIds(opts?.previouslySurfaced ?? [], today);
  for (const id of opts?.pinnedIds ?? []) {
    if (id) recent.add(id);
  }

  const bumpers = standalone
    .filter((card) => !recent.has(card.item.id) && isHomeOverflowCandidate(card.item, today))
    .sort(compare);
  const sticky = standalone.filter((card) => recent.has(card.item.id)).sort(compare);
  const otherNew = standalone
    .filter((card) => !recent.has(card.item.id) && !isHomeOverflowCandidate(card.item, today))
    .sort(compare);

  return { today, ranked: [...bumpers, ...sticky, ...otherNew] };
}

/** Full Home-eligible obligation pool, same bar as Home, no display cap. */
export function selectAllHomeActions<T extends PlacementItem>(
  items: T[],
  opts?: {
    today?: Date;
    previouslySurfaced?: HomeSurfaced[];
    pinnedIds?: string[];
  },
): PlacementCard<T>[] {
  return rankHomeEligibleCards(items, opts).ranked;
}

/**
 * Persist order: Home-shown cards at rank 0..n-1 (max HOME_VISIBLE_MAX),
 * See all at HOME_OVERFLOW_RANK_BASE+. Overflow is only leftover Home-spotlight
 * items — never Radar holds, undated watch, or far-dated leftovers.
 */
export function orderHomeSpotlightQueue<T extends PlacementItem>(
  items: T[],
  opts?: {
    today?: Date;
    previouslySurfaced?: HomeSurfaced[];
    pinnedIds?: string[];
    limit?: number;
  },
): { home: PlacementCard<T>[]; overflow: PlacementCard<T>[] } {
  const { today } = rankHomeEligibleCards(items, opts);
  const cap = Math.min(HOME_VISIBLE_MAX, Math.max(1, opts?.limit ?? HOME_VISIBLE_MAX));
  const ranked = rankHomeSpotlightCards(items, opts, today);
  return { home: ranked.slice(0, cap), overflow: ranked.slice(cap) };
}

function rankHomeSpotlightCards<T extends PlacementItem>(
  items: T[],
  _opts: {
    today?: Date;
    previouslySurfaced?: HomeSurfaced[];
    pinnedIds?: string[];
  } | undefined,
  today: Date,
): PlacementCard<T>[] {
  const hydrated = hydrateParents(items);
  const byId = new Map(hydrated.map((row) => [row.id, row]));
  const clusters = asHomeNeededNowCards(hydrated, today);
  const folded = new Set<string>();
  for (const card of clusters) {
    folded.add(card.item.id);
    for (const child of card.children) folded.add(child.id);
  }
  const eligible = hydrated.filter((item) => isHomeSpotlightItem(item, today, byId) && !folded.has(item.id));
  const standalone = asStandaloneCards(hydrated, eligible);
  const sortItem = (card: PlacementCard<T>): T => {
    if (!card.children.length) return card.item;
    return card.children.reduce((soonest, row) => {
      const a = actionDueDay(row, today) || '9999-12-31';
      const b = actionDueDay(soonest, today) || '9999-12-31';
      return a < b ? row : soonest;
    }, card.children[0]!);
  };
  return [...clusters, ...standalone].sort((a, b) => compareHomeActions(sortItem(a), sortItem(b)));
}

/**
 * Relevant dated obligations, capped for the Home card.
 * Order is stable by due day. See all is the leftover after the cap — not a rotating leftover from the last visit.
 */
export function selectHomeActions<T extends PlacementItem>(
  items: T[],
  opts?: {
    today?: Date;
    previouslySurfaced?: HomeSurfaced[];
    pinnedIds?: string[];
    limit?: number;
  },
): PlacementCard<T>[] {
  return orderHomeSpotlightQueue(items, opts).home;
}

export function childStandaloneTitle(
  childTitle: string | null | undefined,
  parent: { title?: string | null; when?: string | null } | null | undefined,
): string {
  const title = (childTitle || '').trim() || 'Untitled';
  const parentTitle = shortEventTitle(parent?.title);
  if (!parentTitle) return title;
  const when = (parent?.when || '').trim();
  if (when) return `${title} — ${parentTitle} is ${when}`;
  return `${title} — ${parentTitle}`;
}

/** Strip calendar leftover like "Confirmation! @ Sep 8, 2026, 1:30:00 PM …". */
export function shortEventTitle(raw?: string | null): string {
  const title = (raw || '').replace(/\s+/g, ' ').trim();
  if (!title) return '';
  const stripped = title
    .replace(/\s+Confirmation!?/gi, '')
    .replace(/\s*@\s+\w{3}\s+\d{1,2},\s+\d{4}.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || title;
}
