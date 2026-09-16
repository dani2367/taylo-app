/** Match email/chat event rows to calendar occurrences and merge instead of duplicating. */

import { dateOnly } from './placement.ts';
import { titleNamesAttendableEvent } from './intake-contract.ts';
import { loadViewerContext } from './item-visibility.ts';

export const CROSS_SOURCE_DATE_SLACK_DAYS = 1;
export const TITLE_HIGH = 0.68;
export const TITLE_MEDIUM = 0.5;

const STOP = new Set(['the', 'a', 'an', 'of', 'on', 'at', 'for', 'to', 'and', 'in', 'with', 'from', 'by']);
const SYN_GROUPS = [
  ['birthday', 'bday', 'party'],
  ['wedding', 'marriage'],
  ['trip', 'outing', 'excursion'],
];

export const CROSS_SOURCE_SELECT =
  'id, title, kind, source, who_it_affects, occurs_at, due_at, event_date, parent_id, collection_id, status, evidence, body, detail, suggestion, action_description, source_email_subject, source_email_sender, category, user_id, created_by, household_id, visibility';

export type LinkableItem = {
  id?: string | null;
  title?: string | null;
  kind?: string | null;
  source?: string | null;
  who_it_affects?: string | null;
  occurs_at?: string | null;
  due_at?: string | null;
  event_date?: string | null;
  parent_id?: string | null;
  collection_id?: string | null;
  status?: string | null;
  evidence?: string | null;
  body?: string | null;
  detail?: string | null;
  suggestion?: string | null;
  action_description?: string | null;
  source_email_subject?: string | null;
  source_email_sender?: string | null;
  category?: string | null;
  user_id?: string | null;
  created_by?: string | null;
  household_id?: string | null;
  visibility?: string | null;
};

export type LinkConfidence = 'high' | 'medium' | 'low';

export type CrossSourcePlan =
  | { action: 'create'; confidence: 'none' }
  | {
      action: 'merge';
      confidence: 'high';
      canonicalId: string;
      dismissId: string | null;
      repointFromParentId: string | null;
      patch: Record<string, unknown>;
    };

type ItemsClient = {
  from: (table: string) => any;
};

export function eventAnchorDay(item: LinkableItem): string | null {
  return dateOnly(item.occurs_at || item.event_date || item.due_at || null);
}

export function provenance(item: LinkableItem): 'calendar' | 'email' | 'chat' | 'other' {
  const source = (item.source || '').toLowerCase();
  if (source === 'calendar') return 'calendar';
  if (source === 'email') return 'email';
  if (source === 'chat' || source === 'manual') return 'chat';
  return 'other';
}

export function isLinkableParent(item: LinkableItem): boolean {
  if (item.parent_id) return false;
  if (item.collection_id) return false;
  const status = (item.status || 'open').toLowerCase();
  if (status !== 'open') return false;
  const kind = (item.kind || '').toLowerCase();
  return kind === 'occurrence' || kind === 'context_only';
}

export function titleSimilarity(a: string, b: string): number {
  const ta = expandTokens(tokensOf(a));
  const tb = expandTokens(tokensOf(b));
  const jac = jaccard(ta, tb);
  const dice = bigramDice(compact(a), compact(b));
  const contain = containment(ta, tb);
  return Math.max(jac, dice, contain);
}

export function ownerKey(item: LinkableItem): string | null {
  return item.created_by || item.user_id || null;
}

export function scoreCrossSourceMatch(incoming: LinkableItem, existing: LinkableItem): {
  confidence: LinkConfidence | 'none';
  titleScore: number;
  dateDeltaDays: number | null;
} {
  if (!isLinkableParent(incoming) || !isLinkableParent(existing)) {
    return { confidence: 'none', titleScore: 0, dateDeltaDays: null };
  }
  if (incoming.id && existing.id && incoming.id === existing.id) {
    return { confidence: 'none', titleScore: 0, dateDeltaDays: 0 };
  }
  const sameOwner = ownerKey(incoming) && ownerKey(existing) && ownerKey(incoming) === ownerKey(existing);
  // Same person: Apple vs Outlook twins stay separate. Two partners' calendars of the same event may merge.
  if (provenance(incoming) === 'calendar' && provenance(existing) === 'calendar' && (sameOwner || !ownerKey(incoming) || !ownerKey(existing))) {
    return { confidence: 'none', titleScore: 0, dateDeltaDays: null };
  }
  if (provenance(incoming) === 'other' || provenance(existing) === 'other') {
    return { confidence: 'none', titleScore: 0, dateDeltaDays: null };
  }

  const dayA = eventAnchorDay(incoming);
  const dayB = eventAnchorDay(existing);
  if (!dayA || !dayB) return { confidence: 'none', titleScore: 0, dateDeltaDays: null };
  const dateDeltaDays = Math.abs(ymdDiff(dayA, dayB));

  if (!whoCompatible(incoming.who_it_affects, existing.who_it_affects)) {
    return { confidence: 'none', titleScore: 0, dateDeltaDays };
  }

  const titleScore = titleSimilarity(incoming.title || '', existing.title || '');
  const named = titleNamesAttendableEvent(incoming.title || '') && titleNamesAttendableEvent(existing.title || '');
  const tokensA = expandTokens(tokensOf(incoming.title || ''));
  const tokensB = expandTokens(tokensOf(existing.title || ''));
  const shared = intersectSize(tokensA, tokensB);
  const distinctive = shared >= 2 || (shared >= 1 && titleScore >= TITLE_HIGH);

  if (!distinctive) return { confidence: 'none', titleScore, dateDeltaDays };

  if (dateDeltaDays > CROSS_SOURCE_DATE_SLACK_DAYS) {
    return { confidence: 'none', titleScore, dateDeltaDays };
  }
  if (dateDeltaDays === 1 && !named) {
    return { confidence: 'medium', titleScore, dateDeltaDays };
  }
  if (titleScore >= TITLE_HIGH) return { confidence: 'high', titleScore, dateDeltaDays };
  if (titleScore >= TITLE_MEDIUM) return { confidence: 'medium', titleScore, dateDeltaDays };
  return { confidence: 'none', titleScore, dateDeltaDays };
}

export function planCrossSourceLink(incoming: LinkableItem, existing: LinkableItem[]): CrossSourcePlan {
  let best: { item: LinkableItem; titleScore: number; dateDeltaDays: number } | null = null;
  for (const row of existing) {
    const scored = scoreCrossSourceMatch(incoming, row);
    if (scored.confidence !== 'high' || !row.id) continue;
    if (
      !best ||
      scored.titleScore > best.titleScore ||
      (scored.titleScore === best.titleScore && (scored.dateDeltaDays ?? 99) < best.dateDeltaDays)
    ) {
      best = { item: row, titleScore: scored.titleScore, dateDeltaDays: scored.dateDeltaDays ?? 99 };
    }
  }
  if (!best?.item.id) return { action: 'create', confidence: 'none' };

  const other = best.item;
  const incomingIsCalendar = provenance(incoming) === 'calendar';
  const existingIsCalendar = provenance(other) === 'calendar';
  const differentOwners =
    !!ownerKey(incoming) && !!ownerKey(other) && ownerKey(incoming) !== ownerKey(other);

  if (differentOwners) {
    return {
      action: 'merge',
      confidence: 'high',
      canonicalId: other.id,
      dismissId: incoming.id ?? null,
      repointFromParentId: incoming.id && incoming.id !== other.id ? incoming.id : null,
      patch: { ...foldPatch(other, incoming), visibility: 'shared' },
    };
  }

  if (incomingIsCalendar && incoming.id) {
    return {
      action: 'merge',
      confidence: 'high',
      canonicalId: incoming.id,
      dismissId: other.id ?? null,
      repointFromParentId: other.id ?? null,
      patch: foldPatch(incoming, other),
    };
  }

  return {
    action: 'merge',
    confidence: 'high',
    canonicalId: other.id,
    dismissId: incoming.id && !existingIsCalendar ? incoming.id : null,
    repointFromParentId: incoming.id && !incomingIsCalendar ? incoming.id : null,
    patch: foldPatch(other, incoming),
  };
}

export function foldedEvidence(canonical: string | null | undefined, extra: string | null | undefined): string | null {
  return foldText(canonical, extra);
}

export async function loadLinkCandidates(
  supabase: ItemsClient,
  userId: string,
): Promise<LinkableItem[]> {
  const viewer = await loadViewerContext(supabase, userId);
  const { data, error } = await supabase
    .from('items')
    .select(CROSS_SOURCE_SELECT)
    .eq('household_id', viewer.householdId)
    .eq('status', 'open')
    .in('kind', ['occurrence', 'context_only'])
    .is('parent_id', null);
  if (error) {
    console.error('Failed to load cross-source candidates:', error.message);
    return [];
  }
  return ((data ?? []) as LinkableItem[]).filter((row) => isLinkableParent(row));
}

/** Email/chat parent not yet inserted. Merge into an existing calendar (or other) row when high-confidence. */
export async function linkIncomingItem(
  supabase: ItemsClient,
  userId: string,
  incoming: LinkableItem,
): Promise<{ merged: boolean; canonicalId: string | null }> {
  if (!isLinkableParent({ ...incoming, status: incoming.status || 'open' })) {
    return { merged: false, canonicalId: null };
  }
  const candidates = await loadLinkCandidates(supabase, userId);
  const plan = planCrossSourceLink(incoming, candidates);
  if (plan.action !== 'merge') return { merged: false, canonicalId: null };
  await applyCrossSourcePlan(supabase, userId, plan);
  return { merged: true, canonicalId: plan.canonicalId };
}

/** Newly inserted calendar occurrences: fold matching email/chat parents into them. */
export async function linkInsertedCalendarItems(
  supabase: ItemsClient,
  userId: string,
  calendarItemIds: string[],
): Promise<number> {
  if (!calendarItemIds.length) return 0;
  const { data, error } = await supabase
    .from('items')
    .select(CROSS_SOURCE_SELECT)
    .in('id', calendarItemIds);
  if (error) {
    console.error('Failed to load new calendar items for linking:', error.message);
    return 0;
  }
  const candidates = await loadLinkCandidates(supabase, userId);
  let merged = 0;
  for (const row of (data ?? []) as LinkableItem[]) {
    const others = candidates.filter((item) => item.id !== row.id);
    const plan = planCrossSourceLink(row, others);
    if (plan.action !== 'merge') continue;
    await applyCrossSourcePlan(supabase, userId, plan);
    merged += 1;
  }
  return merged;
}

export async function applyCrossSourcePlan(
  supabase: ItemsClient,
  userId: string,
  plan: Extract<CrossSourcePlan, { action: 'merge' }>,
): Promise<void> {
  if (Object.keys(plan.patch).length) {
    const { error } = await supabase.from('items').update(plan.patch).eq('id', plan.canonicalId);
    if (error) console.error('Failed to fold cross-source evidence:', error.message);
  }
  if (plan.repointFromParentId && plan.repointFromParentId !== plan.canonicalId) {
    const { error } = await supabase
      .from('items')
      .update({ parent_id: plan.canonicalId })
      .eq('parent_id', plan.repointFromParentId);
    if (error) console.error('Failed to repoint children after cross-source merge:', error.message);

    const { error: emailError } = await supabase
      .from('source_emails')
      .update({ item_id: plan.canonicalId })
      .eq('item_id', plan.repointFromParentId);
    if (emailError) console.error('Failed to reparent source emails after merge:', emailError.message);
  }
  if (plan.dismissId && plan.dismissId !== plan.canonicalId) {
    const { error } = await supabase
      .from('items')
      .update({ status: 'dismissed' })
      .eq('id', plan.dismissId)
      .eq('status', 'open');
    if (error) console.error('Failed to dismiss superseded cross-source item:', error.message);
  }
}

function foldPatch(canonical: LinkableItem, extra: LinkableItem): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const evidence = foldText(canonical.evidence, extra.evidence);
  if (evidence && evidence !== (canonical.evidence || '')) patch.evidence = evidence;
  const detail = foldText(canonical.detail, extra.detail || (provenance(extra) === 'email' ? extra.body : null));
  if (detail && detail !== (canonical.detail || '')) patch.detail = detail;
  if (!canonical.suggestion && extra.suggestion) patch.suggestion = extra.suggestion;
  if (!canonical.action_description && extra.action_description) {
    patch.action_description = extra.action_description;
  }
  if (!canonical.who_it_affects && extra.who_it_affects) patch.who_it_affects = extra.who_it_affects;
  if (!canonical.source_email_subject && extra.source_email_subject) {
    patch.source_email_subject = extra.source_email_subject;
  }
  if (!canonical.source_email_sender && extra.source_email_sender) {
    patch.source_email_sender = extra.source_email_sender;
  }
  if (!canonical.category && extra.category) patch.category = extra.category;
  if (provenance(canonical) !== 'calendar') {
    if ((canonical.kind || '') !== 'occurrence' && extra.kind === 'occurrence') {
      patch.kind = 'occurrence';
    }
    const betterWhen = preferTimedStamp(canonical.occurs_at, extra.occurs_at);
    if (betterWhen && betterWhen !== (canonical.occurs_at || '')) {
      patch.occurs_at = betterWhen;
      patch.event_date = extra.event_date || betterWhen;
    }
  }
  return patch;
}

function foldText(a?: string | null, b?: string | null): string | null {
  const x = (a || '').replace(/\s+/g, ' ').trim();
  const y = (b || '').replace(/\s+/g, ' ').trim();
  if (!x) return y || null;
  if (!y) return x || null;
  if (x.includes(y) || y.includes(x)) return x.length >= y.length ? x : y;
  return `${x}\n\n${y}`.slice(0, 2000);
}

function tokensOf(title: string): string[] {
  return normalizeTitle(title)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]s\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(title: string): string {
  return normalizeTitle(title).replace(/\s+/g, '');
}

function expandTokens(tokens: string[]): Set<string> {
  const out = new Set(tokens);
  for (const group of SYN_GROUPS) {
    if (group.some((word) => out.has(word))) {
      for (const word of group) out.add(word);
    }
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function containment(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of small) if (!large.has(token)) return 0;
  return small.size >= 2 ? 0.9 : 0;
}

function bigramDice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a && a === b ? 1 : 0;
  const ga = ngrams(a);
  const gb = ngrams(b);
  let inter = 0;
  for (const gram of ga) if (gb.has(gram)) inter += 1;
  return (2 * inter) / (ga.size + gb.size);
}

function ngrams(value: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) out.add(value.slice(i, i + 2));
  return out;
}

function intersectSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const token of a) if (b.has(token)) n += 1;
  return n;
}

function whoCompatible(a?: string | null, b?: string | null): boolean {
  const left = whoTokens(a);
  const right = whoTokens(b);
  if (!left.length || !right.length) return true;
  return left.some((name) => right.some((other) => namesOverlap(name, other)));
}

function namesOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  if (a.endsWith('s') && a.slice(0, -1) === b) return true;
  if (b.endsWith('s') && b.slice(0, -1) === a) return true;
  return false;
}

function preferTimedStamp(canonical?: string | null, extra?: string | null): string | null {
  const a = canonical?.trim() || '';
  const b = extra?.trim() || '';
  if (!a) return b || null;
  if (!b) return a;
  const aTimed = /[T ]\d{2}:\d{2}/.test(a) && !/T00:00/.test(a);
  const bTimed = /[T ]\d{2}:\d{2}/.test(b) && !/T00:00/.test(b);
  if (bTimed && !aTimed) return b;
  return a;
}

function whoTokens(raw?: string | null): string[] {
  if (!raw) return [];
  const value = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!value || ['family', 'everyone', 'all', 'whole family', 'both'].includes(value)) return [];
  return value
    .split(/,|&|\band\b/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

function ymdDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map((bit) => Number(bit));
  const [by, bm, bd] = b.split('-').map((bit) => Number(bit));
  const ms = Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd);
  return Math.round(ms / 86400000);
}
