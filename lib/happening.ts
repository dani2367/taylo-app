import { resolvePlanIcon, type PlanIconSpec } from './plan-icon';

export type HappenItem = {
  id: string;
  title: string;
  time: string;
  sub: string | null;
  icon: PlanIconSpec;
};

/** Temporary visual placeholders for Happening Today — remove when calendar sync lands. */
export const PREVIEW_HAPPENING: HappenItem[] = [
  {
    id: 'preview-dad-birthday',
    title: "Dad's birthday",
    time: 'All day',
    sub: null,
    icon: resolvePlanIcon({ title: "Dad's birthday", category: 'activity' }),
  },
  {
    id: 'preview-nursery',
    title: 'Nursery',
    time: '8:30',
    sub: 'Drop off',
    icon: resolvePlanIcon({ title: 'Nursery', category: 'school' }),
  },
  {
    id: 'preview-dentist',
    title: 'Dentist',
    time: '2:15',
    sub: "Teddy's appointment",
    icon: resolvePlanIcon({ title: 'dentist', category: 'medical' }),
  },
];

export function isPreviewHappenId(id: string): boolean {
  return id.startsWith('preview-');
}

export function dayMood(count: number) {
  if (count <= 1) return 'A quiet one';
  if (count <= 3) return 'A fairly calm one';
  return 'A fuller one';
}

export function happenCountLabel(count: number) {
  return count === 1 ? '1 thing happening' : `${count} things happening`;
}

export function happenSortKey(item: HappenItem): number {
  if (/^all day$/i.test(item.time)) return 0;
  const match = /(\d{1,2})(?::(\d{2}))?/.exec(item.time);
  if (!match) return 1;
  return Number(match[1]) * 60 + Number(match[2] || 0);
}

/** Home day card shows 8:30 / 2:15, not 8:30am. */
export function happenClockLabel(timeLabel: string | null | undefined): string {
  if (!timeLabel) return 'All day';
  const stripped = timeLabel.replace(/(am|pm)$/i, '').trim();
  return stripped || 'All day';
}
