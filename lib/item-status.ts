import { supabase } from '@/lib/supabase';

export type ClosedItemStatus = 'done' | 'delegated' | 'dismissed';

/** Dismissing / completing a parent always closes its open children. */
export async function closeItems(
  itemIds: string[],
  status: ClosedItemStatus,
): Promise<{ error: { message: string } | null }> {
  const unique = [...new Set(itemIds.filter(Boolean))];
  if (!unique.length) return { error: null };

  const { data: children, error: childError } = await supabase
    .from('items')
    .select('id')
    .in('parent_id', unique);
  if (childError) return { error: childError };

  const ids = [...new Set([...unique, ...((children as { id: string }[] | null) ?? []).map((row) => row.id)])];
  const { error } = await supabase.from('items').update({ status }).in('id', ids);
  if (error) return { error };

  const { error: spotlightError } = await supabase.from('home_spotlight').delete().in('item_id', ids);
  if (spotlightError) console.error('Failed to drop closed items from spotlight:', spotlightError.message);
  return { error: null };
}
