import type { PrepCheckItem } from '@/components/app/ItemPrepChecklist';
import { supabase } from '@/lib/supabase';

export async function persistChecklistToggle(entryId: string, done: boolean) {
  return supabase.from('items').update({ status: done ? 'done' : 'open' }).eq('id', entryId);
}

export async function persistChecklistText(entryId: string, text: string) {
  return supabase.from('items').update({ title: text }).eq('id', entryId);
}

export async function persistChecklistDelete(entryId: string) {
  return supabase.from('items').update({ status: 'dismissed' }).eq('id', entryId);
}

export async function persistChecklistAdd(params: {
  userId: string;
  itemId: string;
  itemTitle: string;
  checklistId: string | null;
  nextOrder: number;
}): Promise<{ checklistId: string; entry: PrepCheckItem } | { error: string }> {
  const { data: parent } = await supabase
    .from('items')
    .select('source, source_label, category, who_it_affects, visibility')
    .eq('id', params.itemId)
    .maybeSingle();

  const source =
    parent?.source && ['email', 'chat', 'manual', 'calendar'].includes(parent.source)
      ? parent.source
      : 'manual';

  const { data: entry, error } = await supabase
    .from('items')
    .insert({
      user_id: params.userId,
      parent_id: params.itemId,
      title: 'New',
      status: 'open',
      kind: 'obligation',
      confidence: 'high',
      prep_origin: 'stated',
      due_at: null,
      source,
      source_label: 'Added by you',
      category: parent?.category ?? null,
      who_it_affects: parent?.who_it_affects ?? null,
      visibility: parent?.visibility === 'shared' ? 'shared' : 'private',
    })
    .select('id, title, status')
    .single();

  if (error || !entry) return { error: error?.message || 'Failed to add item' };
  return {
    checklistId: params.itemId,
    entry: { id: entry.id as string, text: (entry.title as string) || 'New', done: false },
  };
}
