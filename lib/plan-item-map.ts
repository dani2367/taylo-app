import { planContextLine, thingsToSortLabel } from './human-date';
import { displayItemTitle, shortEventTitle, type PlacementCard, type PlacementParent } from './placement';
import { resolvePlanIcon } from './plan-icon';
import { radarGroupedContext, radarStatusLine } from './radar';
import { helpfulSuggestion } from './suggestion';
import type { PlanItemCardModel } from '@/components/app/PlanItemCard';
import type { PrepCheckItem } from '@/components/app/ItemPrepChecklist';

export type PrepChildRow = {
  id: string;
  title: string | null;
  status: string | null;
  created_at?: string | null;
};

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
  due_at?: string | null;
  occurs_at?: string | null;
  kind?: string | null;
  confidence?: string | null;
  surface_from?: string | null;
  surface_until?: string | null;
  parent_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  urgency_level: string | null;
  source_label: string | null;
  source_email_subject: string | null;
  parent?: PlacementParent | PlacementParent[] | null;
  prep_children?: PrepChildRow[] | PrepChildRow | null;
};

export function unwrapPrepChildren(raw: PlanItemRow['prep_children']): PrepChildRow[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export function mapPrepChildren(raw: PlanItemRow['prep_children']): PrepCheckItem[] {
  return unwrapPrepChildren(raw)
    .filter((row) => row.status !== 'dismissed')
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .map((row) => ({
      id: row.id,
      text: row.title || '',
      done: row.status === 'done',
    }));
}

export function mapPlanItemRow(row: PlanItemRow, today = new Date()): PlanItemCardModel {
  const entries = mapPrepChildren(row.prep_children);
  const title = displayItemTitle(row, today);
  const body = row.body || '';
  const detail = row.detail || row.body || row.action_description || '';
  const incomplete = entries.filter((entry) => !entry.done).length;
  return {
    id: row.id,
    title,
    context: planContextLine(
      { event_date: row.due_at || row.event_date, body: row.body, urgency_level: row.urgency_level },
      today,
    ),
    detail,
    suggestion: helpfulSuggestion(row),
    opener: row.action_description || detail || body || title,
    src: row.source_label || row.source_email_subject || 'Plan',
    icon: resolvePlanIcon({ title, category: row.category, stored: row.icon }),
    prepLabel: incomplete ? thingsToSortLabel(incomplete) : null,
    checklistId: null,
    checklist: entries,
    informational: row.kind === 'context_only',
  };
}

export function mapRadarWatchCard(
  card: PlacementCard<PlanItemRow>,
  today = new Date(),
): PlanItemCardModel {
  if (card.children.length >= 1) {
    const countLabel = thingsToSortLabel(card.children.length);
    const childTitles = card.children.map((row) => (row.title || '').trim() || 'Untitled');
    return {
      ...mapPlanItemRow(card.item, today),
      id: `radar-group:${card.item.id}`,
      title: shortEventTitle(card.item.title) || (card.item.title || '').trim() || 'Untitled',
      context: radarGroupedContext(
        card.children.length,
        card.item.occurs_at || card.item.event_date,
        today,
        childTitles,
      ),
      informational: false,
      suggestion: null,
      checklist: card.children.map((row) => ({
        id: row.id,
        text: (row.title || '').trim() || 'Untitled',
        done: false,
      })),
      checklistRowsAreItems: true,
      prepLabel: countLabel,
    };
  }

  const row = card.item;
  return {
    ...mapPlanItemRow(row, today),
    title: displayItemTitle(row, today),
    context: radarStatusLine(row, today),
  };
}

export const PREP_CHILDREN_EMBED = 'prep_children:items!parent_id(id, title, status, created_at)';

export const PARENT_EMBED = 'parent:items!parent_id(id, title, kind, status, collection_id, occurs_at, event_date, due_at)';

export const PLAN_ITEM_SELECT =
  `id, title, body, detail, suggestion, category, icon, action_description, event_date, due_at, occurs_at, kind, confidence, surface_from, surface_until, parent_id, status, urgency_level, source_label, source_email_subject, ${PARENT_EMBED}, ${PREP_CHILDREN_EMBED}`;

export const ITEM_COUNT_SELECT = `id, title, collection_id, ${PREP_CHILDREN_EMBED}`;
