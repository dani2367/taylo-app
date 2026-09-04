import { supabase } from '@/lib/supabase';
import { looksLikeShoppingList } from '@/lib/shopping';

export type CollectionRow = {
  id: string;
  user_id: string;
  title: string;
  emoji: string | null;
  type: 'shopping' | 'event' | 'trip' | 'other';
  status: 'active' | 'completed';
  created_at: string;
};

export async function findOrCreateShoppingCollection(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_or_create_shopping_collection', {
    p_user_id: userId,
  });
  if (error) {
    console.error('Failed to find shopping collection:', error.message);
    return null;
  }
  return typeof data === 'string' ? data : null;
}

export async function addProductsToShoppingList(
  userId: string,
  labels: string[],
): Promise<string | null> {
  const collectionId = await findOrCreateShoppingCollection(userId);
  if (!collectionId) return 'Failed to save shopping list';

  const { data: existing } = await supabase
    .from('items')
    .select('id, title')
    .eq('user_id', userId)
    .eq('collection_id', collectionId)
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  const open = ((existing as { id: string; title: string | null }[] | null) ?? []);
  let list = open.find((row) => looksLikeShoppingList(row.title || '')) ?? null;

  if (!list) {
    const { data: created, error } = await supabase
      .from('items')
      .insert({
        user_id: userId,
        collection_id: collectionId,
        title: 'Shopping',
        body: null,
        detail: null,
        suggestion: 'Need a hand? Chat and Taylo can help you get this done.',
        category: 'errand',
        icon: 'cart-outline',
        colour_class: 'amber',
        source: 'manual',
        source_label: 'Added by you',
        status: 'open',
        urgency_level: 'none',
        action_description: 'Shopping',
      })
      .select('id, title')
      .single();
    if (error || !created) return error?.message || 'Failed to save shopping list';
    list = created;
  }

  const extras = open.filter((row) => row.id !== list.id);
  const extraLabels = extras
    .map((row) => (row.title || '').trim())
    .filter((title) => title && !looksLikeShoppingList(title));
  if (extras.length) {
    await supabase.from('items').update({ status: 'done' }).in('id', extras.map((row) => row.id));
  }

  const toAdd = [...extraLabels, ...labels];
  const appendError = await appendShoppingLabels(userId, list.id, list.title || 'Shopping', toAdd);
  return appendError;
}

async function appendShoppingLabels(
  userId: string,
  itemId: string,
  itemTitle: string,
  labels: string[],
): Promise<string | null> {
  const unique = [...new Map(labels.map((label) => [label.toLowerCase(), label])).values()];
  if (!unique.length) return null;

  const { data: list } = await supabase
    .from('checklists')
    .select('id, checklist_items(text, sort_order)')
    .eq('item_id', itemId)
    .maybeSingle();

  type Nested = { text: string; sort_order: number };
  if (!list) {
    const { data: created, error: listError } = await supabase
      .from('checklists')
      .insert({
        user_id: userId,
        item_id: itemId,
        title: itemTitle,
        subtitle: 'Shopping',
      })
      .select('id')
      .single();
    if (listError || !created) return listError?.message || 'Failed to save shopping list';
    const { error } = await supabase.from('checklist_items').insert(
      unique.map((text, index) => ({
        checklist_id: created.id,
        user_id: userId,
        text,
        done: false,
        sort_order: index,
      })),
    );
    return error?.message ?? null;
  }

  const rows = ([...((list as { checklist_items?: Nested[] | null }).checklist_items ?? [])] as Nested[])
    .sort((a, b) => a.sort_order - b.sort_order);
  const seen = new Set(rows.map((row) => row.text.toLowerCase()));
  const nextOrder = rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 1 : 0;
  const toAdd = unique.filter((label) => !seen.has(label.toLowerCase()));
  if (!toAdd.length) return null;
  const { error } = await supabase.from('checklist_items').insert(
    toAdd.map((text, index) => ({
      checklist_id: (list as { id: string }).id,
      user_id: userId,
      text,
      done: false,
      sort_order: nextOrder + index,
    })),
  );
  return error?.message ?? null;
}

export async function listActiveCollections(userId: string): Promise<CollectionRow[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('id, user_id, title, emoji, type, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to list collections:', error.message);
    return [];
  }
  return (data ?? []) as CollectionRow[];
}

export function unwrapCollection<T extends { status?: string | null }>(
  raw: T | T[] | null | undefined,
): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export function isActiveCollection(raw: { status?: string | null } | { status?: string | null }[] | null | undefined): boolean {
  const collection = unwrapCollection(raw);
  return !collection || collection.status === 'active';
}
