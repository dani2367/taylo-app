import type { PrepCheckItem } from '@/components/app/ItemPrepChecklist';
import { supabase } from '@/lib/supabase';

export async function persistChecklistToggle(entryId: string, done: boolean) {
  return supabase.from('checklist_items').update({ done }).eq('id', entryId);
}

export async function persistChecklistText(entryId: string, text: string) {
  return supabase.from('checklist_items').update({ text }).eq('id', entryId);
}

export async function persistChecklistDelete(entryId: string) {
  return supabase.from('checklist_items').delete().eq('id', entryId);
}

export async function persistChecklistAdd(params: {
  userId: string;
  itemId: string;
  itemTitle: string;
  checklistId: string | null;
  nextOrder: number;
}): Promise<{ checklistId: string; entry: PrepCheckItem } | { error: string }> {
  let checklistId = params.checklistId;
  if (!checklistId) {
    const { data, error } = await supabase
      .from('checklists')
      .insert({
        user_id: params.userId,
        item_id: params.itemId,
        title: params.itemTitle,
        subtitle: 'Prep',
      })
      .select('id')
      .single();
    if (error || !data) return { error: error?.message || 'Failed to create checklist' };
    checklistId = data.id;
  }

  const { data: entry, error } = await supabase
    .from('checklist_items')
    .insert({
      checklist_id: checklistId,
      user_id: params.userId,
      text: 'New',
      done: false,
      sort_order: params.nextOrder,
    })
    .select('id, text, done')
    .single();

  if (error || !entry) return { error: error?.message || 'Failed to add item' };
  return {
    checklistId,
    entry: { id: entry.id, text: entry.text, done: entry.done },
  };
}
