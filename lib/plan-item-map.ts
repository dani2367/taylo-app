import { planContextLine, thingsToSortLabel } from './human-date';
import { resolvePlanIcon } from './plan-icon';
import { helpfulSuggestion } from './suggestion';
import type { PlanItemCardModel } from '@/components/app/PlanItemCard';

export type NestedEntry = { id: string; text: string; done: boolean; sort_order: number };
export type NestedList = { id: string; item_id: string; checklist_items: NestedEntry[] | null };

export type PlanItemRow = {
  id: string;
  title: string | null;
  body: string | null;
  detail: string | null;
  suggestion: string | null;
  category: string | null;
  icon: string | null;
  action_description: string | null;
  event_date: string | null;
  urgency_level: string | null;
  source_label: string | null;
  source_email_subject: string | null;
  checklists: NestedList[] | NestedList | null;
};

export function unwrapLists(raw: NestedList[] | NestedList | null): NestedList[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export function mapPlanItemRow(row: PlanItemRow, today = new Date()): PlanItemCardModel {
  const lists = unwrapLists(row.checklists);
  const list = lists[0];
  const entries = [...(list?.checklist_items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((entry) => ({ id: entry.id, text: entry.text, done: entry.done }));
  const title = row.title || 'Untitled';
  const body = row.body || '';
  const detail = row.detail || row.body || row.action_description || '';
  const incomplete = entries.filter((entry) => !entry.done).length;
  return {
    id: row.id,
    title,
    context: planContextLine(
      { event_date: row.event_date, body: row.body, urgency_level: row.urgency_level },
      today,
    ),
    detail,
    suggestion: helpfulSuggestion(row),
    opener: row.action_description || detail || body || title,
    src: row.source_label || row.source_email_subject || 'Plan',
    icon: resolvePlanIcon({ title, category: row.category, stored: row.icon }),
    prepLabel: incomplete ? thingsToSortLabel(incomplete) : null,
    checklistId: list?.id ?? null,
    checklist: entries,
  };
}

export const PLAN_ITEM_SELECT =
  'id, title, body, detail, suggestion, category, icon, action_description, event_date, urgency_level, source_label, source_email_subject, checklists(id, item_id, checklist_items(id, text, done, sort_order))';
