import { daysUntil } from './human-date.ts';
import {
  isInformationalOnSchedule,
  isScheduleItem,
  scheduleAnchor,
  type PlacementItem,
} from '../supabase/functions/_shared/placement.ts';
import type { PlanIconSpec } from './plan-icon.ts';

export type HappenItem = {
  id: string;
  title: string;
  time: string;
  sub: string | null;
  icon: PlanIconSpec;
  informational?: boolean;
};

/** Whether this row belongs on Home's Today card for this calendar day. */
export function isHappeningToday(item: PlacementItem, today = new Date()): boolean {
  if (!isScheduleItem(item)) return false;
  return daysUntil(scheduleAnchor(item), today) === 0;
}

export function happenTimeLabel(item: PlacementItem, clock: string | null): string {
  if (isInformationalOnSchedule(item)) return 'Note';
  return clock?.trim() || 'All day';
}

export function happenCountLabel(count: number) {
  return count === 1 ? '1 thing happening' : `${count} things happening`;
}

export function happenSortKey(item: { time: string }): number {
  if (/^all day$/i.test(item.time) || /^note$/i.test(item.time)) return 0;
  const match = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(item.time);
  if (!match) return 1;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = (match[3] || '').toLowerCase();
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

/** Home/Plan day card: 12-hour with am/pm (e.g. 2pm, 2:30pm). */
export function happenClockLabel(timeLabel: string | null | undefined): string {
  if (!timeLabel) return 'All day';
  return timeLabel.trim() || 'All day';
}
