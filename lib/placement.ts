export {
  HOME_ACTION_LIMIT,
  HOME_ACTION_MAX,
  HOME_SURFACED_COOLDOWN_MS,
  childStandaloneTitle,
  compareHomeActions,
  compareRadarWatch,
  groupUnderParents,
  isFamilyVisible,
  isHomeEligible,
  isListBound,
  isRadarWatchItem,
  isScheduleItem,
  isSurfaceFromPending,
  isSurfaceWindowOpen,
  recentlySurfacedIds,
  selectHomeActions,
  selectRadarWatch,
  type HomeSurfaced,
  type PlacementCard,
  type PlacementItem,
} from '../supabase/functions/_shared/placement.ts';

import { humanizeEventDate } from './human-date';
import { childStandaloneTitle as formatChildTitle } from '../supabase/functions/_shared/placement.ts';

export type PlacementParent = {
  title?: string | null;
  occurs_at?: string | null;
  event_date?: string | null;
};

export function unwrapParent(
  raw: PlacementParent | PlacementParent[] | null | undefined,
): PlacementParent | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
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
