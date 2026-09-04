import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { appendChecklistItems, looksLikeShoppingList } from './checklists.ts';

export async function findOrCreateShoppingCollection(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_or_create_shopping_collection', {
    p_user_id: userId,
  });
  if (error) {
    console.error('Failed to find shopping collection:', error.message);
    return null;
  }
  return typeof data === 'string' ? data : null;
}

export async function findOrCreateShoppingListItem(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ collectionId: string; itemId: string; title: string } | null> {
  const collectionId = await findOrCreateShoppingCollection(supabase, userId);
  if (!collectionId) return null;

  const { data: existing, error } = await supabase
    .from('items')
    .select('id, title')
    .eq('user_id', userId)
    .eq('collection_id', collectionId)
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load shopping list:', error.message);
    return null;
  }

  const open = (existing ?? []) as { id: string; title: string | null }[];
  let list = open.find((row) => looksLikeShoppingList(row.title || '')) ?? null;

  if (!list) {
    const { data: created, error: createError } = await supabase
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
        status: 'open',
        source: 'chat',
        source_label: 'Added from Ask',
        urgency_level: 'none',
        action_description: 'Shopping',
      })
      .select('id, title')
      .single();
    if (createError || !created) {
      console.error('Failed to create shopping list:', createError?.message);
      return null;
    }
    list = { id: created.id, title: created.title };
  } else if ((list.title || '').trim().toLowerCase() !== 'shopping') {
    await supabase.from('items').update({ title: 'Shopping', icon: 'cart-outline' }).eq('id', list.id);
    list = { id: list.id, title: 'Shopping' };
  }

  const extras = open.filter((row) => row.id !== list.id);
  if (extras.length) {
    const labels = extras
      .map((row) => (row.title || '').trim())
      .filter((title) => title && !looksLikeShoppingList(title));
    if (labels.length) {
      await appendChecklistItems(supabase, {
        userId,
        itemId: list.id,
        itemTitle: list.title || 'Shopping',
        labels,
      });
    }
    await supabase
      .from('items')
      .update({ status: 'done' })
      .in('id', extras.map((row) => row.id));
  }

  return { collectionId, itemId: list.id, title: list.title || 'Shopping' };
}

export function unwrapCollection<T extends { status?: string | null }>(
  raw: T | T[] | null | undefined,
): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export function belongsToCompletedCollection(
  raw: { status?: string | null } | { status?: string | null }[] | null | undefined,
): boolean {
  const collection = unwrapCollection(raw);
  return collection?.status === 'completed';
}
