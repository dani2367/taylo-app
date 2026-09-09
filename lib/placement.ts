export {
  HOME_ACTION_LIMIT,
  HOME_ACTION_MAX,
  HOME_VISIBLE_MAX,
  HOME_OVERFLOW_RANK_BASE,
  isHomeSpotlightItem,
  HOME_NEAR_TERM_DAYS,
  HOME_RADAR_LOAD_KINDS,
  HOME_SURFACED_COOLDOWN_MS,
  SPOTLIGHT_STALE_MS,
  asRadarWatchCards,
  asStandaloneCards,
  asHomeNeededNowCards,
  childStandaloneTitle,
  compareHomeActions,
  compareRadarWatch,
  exceptHomeActions,
  isFamilyVisible,
  isHomeEligible,
  isBarePrepTitle,
  isBarePrepChild,
  isChildOfClosedParent,
  isListBound,
  isObligationOverdueAgainstParent,
  isRadarWatchItem,
  isInformationalOnSchedule,
  isOccurrenceOnSchedule,
  isScheduleItem,
  isSurfaceFromPending,
  isSurfaceWindowOpen,
  lookupParent,
  isHomeOverflowCandidate,
  isNearTermDue,
  isDueTodayOrOverdue,
  actionDueDay,
  recentlySurfacedIds,
  sameIdSet,
  selectAllHomeActions,
  orderHomeSpotlightQueue,
  selectHomeActions,
  selectRadarWatch,
  shouldRegenerateSpotlight,
  shortEventTitle,
  unwrapPlacementParent,
  type HomeSurfaced,
  type PlacementCard,
  type PlacementItem,
  type PlacementParentRef,
} from '../supabase/functions/_shared/placement.ts';

import { humanizeEventDate } from './human-date';
import {
  childStandaloneTitle as formatChildTitle,
  unwrapPlacementParent,
} from '../supabase/functions/_shared/placement.ts';

export type PlacementParent = {
  title?: string | null;
  kind?: string | null;
  status?: string | null;
  collection_id?: string | null;
  occurs_at?: string | null;
  event_date?: string | null;
  due_at?: string | null;
};

export function unwrapParent(
  raw: PlacementParent | PlacementParent[] | null | undefined,
): PlacementParent | null {
  return unwrapPlacementParent(raw);
}

export function displayItemTitle(
  item: { title?: string | null; parent_id?: string | null; parent?: PlacementParent | PlacementParent[] | null },
  today = new Date(),
): string {
  const parent = unwrapParent(item.parent);
  if (!item.parent_id || !parent?.title) return (item.title || '').trim() || 'Untitled';
  const when = humanizeEventDate(parent.occurs_at || parent.event_date, today);
  return formatChildTitle(item.title, { title: parent.title, when });
}
