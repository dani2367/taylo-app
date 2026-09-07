import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { intakeRowFields, type IntakeItem } from './intake-contract.ts';

const MAX_ITEMS = 24;
const MAX_LABEL_LEN = 40;

const SHOPPING_TITLE_RE =
  /\b(shop(?:ping)?(?:\s+list)?|grocer(?:y|ies)?|tesco|sainsbury'?s?|waitrose|asda|aldi|lidl|morrisons|iceland|co-?op)\b/i;

export function looksLikeShoppingList(title: string): boolean {
  return SHOPPING_TITLE_RE.test(title);
}

/** Product name only: "Chicken", not "To buy some chicken". */
export function cleanGroceryProductLabel(raw: string): string {
  let label = raw.replace(/\s+/g, ' ').trim().replace(/^[.!?]+|[.!?]+$/g, '');
  for (let i = 0; i < 3; i += 1) {
    const next = label
      .replace(/^(?:i\s+)?(?:just\s+)?(?:need to |need |want to |want |gotta |have to |must )\s*/i, '')
      .replace(/^(?:to\s+)?(?:buy|get|grab|pick\s*up)\s+/i, '')
      .replace(/^(?:some|a|an|the)\s+/i, '')
      .trim();
    if (next === label) break;
    label = next;
  }
  label = label.replace(/\s+for\s+.+$/i, '').trim();
  if (!label || looksLikeShoppingList(label)) return '';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function parseChecklistLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const label = raw.replace(/\s+/g, ' ').trim();
    if (!label || label.toLowerCase() === 'null') continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label.slice(0, MAX_LABEL_LEN));
    if (labels.length >= MAX_ITEMS) break;
  }
  return labels;
}

type ParentRow = {
  source: string | null;
  source_label: string | null;
  category: string | null;
  who_it_affects: string | null;
};

export async function insertIntakeChildren(
  supabase: SupabaseClient,
  params: { userId: string; itemId: string; items: IntakeItem[]; listItem?: boolean },
): Promise<string[]> {
  const items = params.items.filter((item) => item.title.trim()).slice(0, MAX_ITEMS);
  if (!items.length) return [];

  const [{ data: parent }, { data: existing, error: existingError }] = await Promise.all([
    supabase
      .from('items')
      .select('source, source_label, category, who_it_affects')
      .eq('id', params.itemId)
      .maybeSingle(),
    supabase.from('items').select('title').eq('parent_id', params.itemId),
  ]);

  if (existingError) {
    console.error('Failed to load child obligations:', existingError.message);
    return [];
  }

  const seen = new Set(
    ((existing ?? []) as { title: string | null }[])
      .map((row) => (row.title || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const toAdd = items.filter((item) => !seen.has(item.title.toLowerCase()));
  const room = Math.max(0, MAX_ITEMS - seen.size);
  const slice = toAdd.slice(0, room);
  if (!slice.length) return [];

  const meta = (parent as ParentRow | null) ?? null;
  const source =
    meta?.source && ['email', 'chat', 'manual', 'calendar'].includes(meta.source)
      ? meta.source
      : 'manual';

  const { error: insertError } = await supabase.from('items').insert(
    slice.map((item) => ({
      user_id: params.userId,
      parent_id: params.itemId,
      title: item.title.slice(0, MAX_LABEL_LEN),
      status: 'open',
      source,
      source_label: meta?.source_label ?? 'Prep',
      category: meta?.category ?? null,
      who_it_affects: meta?.who_it_affects ?? null,
      ...intakeRowFields(item),
      kind: params.listItem ? 'list_item' : item.kind,
    })),
  );
  if (insertError) {
    console.error('Failed to insert child obligations:', insertError.message);
    return [];
  }
  return slice.map((item) => item.title);
}

/** Create prep as independent items rows (parent_id = owning occurrence/heads-up). */
export async function insertPrepChecklist(
  supabase: SupabaseClient,
  params: { userId: string; itemId: string; itemTitle: string; labels: string[]; subtitle?: string },
): Promise<void> {
  await insertIntakeChildren(supabase, {
    userId: params.userId,
    itemId: params.itemId,
    items: parseChecklistLabels(params.labels).map((title) => ({
      title,
      kind: 'obligation',
      occurs_at: null,
      due_at: null,
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'medium',
      evidence: '',
      surface_from: null,
      surface_until: null,
    })),
  });
}

export async function appendChecklistItems(
  supabase: SupabaseClient,
  params: { userId: string; itemId: string; itemTitle: string; labels: string[] },
): Promise<string[]> {
  return insertIntakeChildren(supabase, {
    userId: params.userId,
    itemId: params.itemId,
    listItem: true,
    items: parseChecklistLabels(params.labels).map((title) => ({
      title,
      kind: 'list_item',
      occurs_at: null,
      due_at: null,
      actionable: 'yes',
      prep_implied: 'none',
      confidence: 'high',
      evidence: '',
      surface_from: null,
      surface_until: null,
    })),
  });
}

export const CHECKLIST_PROMPT_RULE = `- Shopping / groceries only: put each mentioned product in checklist_items (["Chicken"]). Product names only. Do not invent extras.
- For family prep (trips, birthdays, appointments): do NOT use checklist_items. Return each obligation as its own intake item instead.`;
