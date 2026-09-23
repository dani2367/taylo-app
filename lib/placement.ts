export {
  HOME_ACTION_LIMIT,
  HOME_ACTION_MAX,
  HOME_VISIBLE_MAX,
  HOME_OVERFLOW_RANK_BASE,
  isHomeSpotlightItem,
  isOpenForSurfacing,
  HOME_NEAR_TERM_DAYS,
  RADAR_PAST_PARENT_KEEP_DAYS,
  HOME_RADAR_LOAD_KINDS,
  HOME_SURFACED_COOLDOWN_MS,
  isSameLondonDay,
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
  isAgedRadarPackingLeftover,
  isPastParentPackingLeftover,
  isPastParentPackingLeftoverCard,
  isRadarWatchItem,
  isInformationalOnSchedule,
  isOccurrenceOnSchedule,
  isScheduleItem,
  scheduleAnchor,
  isSurfaceFromPending,
  isSurfaceWindowOpen,
  lookupParent,
  isHomeOverflowCandidate,
  isExpiredDateBoundAdmin,
  isGiftOrPackingWork,
  homeCardDueDay,
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
