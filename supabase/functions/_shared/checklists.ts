import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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

export async function insertPrepChecklist(
  supabase: SupabaseClient,
  params: { userId: string; itemId: string; itemTitle: string; labels: string[]; subtitle?: string },
): Promise<void> {
  const labels = parseChecklistLabels(params.labels);
  if (!labels.length) return;

  const { data: checklist, error: checklistError } = await supabase
    .from('checklists')
    .insert({
      user_id: params.userId,
      item_id: params.itemId,
      title: params.itemTitle,
      subtitle: params.subtitle ?? (looksLikeShoppingList(params.itemTitle) ? 'Shopping' : 'Prep'),
    })
    .select('id')
    .single();

  if (checklistError || !checklist) {
    console.error('Failed to insert checklist:', checklistError?.message);
    return;
  }

  const rows = labels.map((text, index) => ({
    checklist_id: checklist.id,
    user_id: params.userId,
    text,
    done: false,
    sort_order: index,
  }));

  const { error: itemsError } = await supabase.from('checklist_items').insert(rows);
  if (itemsError) {
    console.error('Failed to insert checklist items:', itemsError.message);
  }
}

type NestedEntry = { text: string; sort_order: number };

export async function appendChecklistItems(
  supabase: SupabaseClient,
  params: { userId: string; itemId: string; itemTitle: string; labels: string[] },
): Promise<string[]> {
  const labels = parseChecklistLabels(params.labels);
  if (!labels.length) return [];

  const { data: existing, error } = await supabase
    .from('checklists')
    .select('id, checklist_items(text, sort_order)')
    .eq('item_id', params.itemId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load checklist for append:', error.message);
    return [];
  }

  if (!existing) {
    await insertPrepChecklist(supabase, params);
    return labels;
  }

  const rows = ((existing as { checklist_items?: NestedEntry[] | null }).checklist_items ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const seen = new Set(rows.map((row) => row.text.toLowerCase()));
  const nextOrder = rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 1 : 0;
  const room = Math.max(0, MAX_ITEMS - rows.length);
  const toAdd = labels.filter((label) => !seen.has(label.toLowerCase())).slice(0, room);
  if (!toAdd.length) return [];

  const { error: insertError } = await supabase.from('checklist_items').insert(
    toAdd.map((text, index) => ({
      checklist_id: (existing as { id: string }).id,
      user_id: params.userId,
      text,
      done: false,
      sort_order: nextOrder + index,
    })),
  );
  if (insertError) {
    console.error('Failed to append checklist items:', insertError.message);
    return [];
  }
  return toAdd;
}

export const CHECKLIST_PROMPT_RULE = `- checklist_items: optional array of short labels, or null.

  Shopping / groceries / "I need some turmeric" / "I need to buy X" / "get milk and bread":
  These are shopping products, not a standalone to-do. title should be the product name ("Turmeric"), never "Buy turmeric" or "Shopping list".
  Put every product they mentioned in checklist_items, even if there is only one: ["Chicken"]. Product names only — never "To buy some chicken", "Need chicken", or "Buy chicken".
  Do not invent extra groceries they did not mention.

  Prep for something coming up (birthday, party, trip, sports day, appointment):
  2–5 concrete prep labels they mentioned or clearly need (e.g. ["Present", "Card"]).

  Do NOT invent a list for a bill, a delivery to track, or a one-step non-shopping to-do ("email the teacher", "book the dentist").`;
