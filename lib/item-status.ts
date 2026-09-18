import { supabase } from '@/lib/supabase';
import {
  confirmActionLibraryCompletion,
  emptyActionFactsStore,
} from '@/lib/action-library';
import { loadFamilyKnowledge, persistFactRow, persistFactStatus } from '@/lib/family-facts';

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
  if (status === 'done') {
    await recordActionLibraryConfirmations(unique);
  }

  const { error } = await supabase.from('items').update({ status }).in('id', ids);
  if (error) return { error };

  const { error: spotlightError } = await supabase.from('home_spotlight').delete().in('item_id', ids);
  if (spotlightError) console.error('Failed to drop closed items from spotlight:', spotlightError.message);
  return { error: null };
}

async function recordActionLibraryConfirmations(itemIds: string[]): Promise<void> {
  const { data: rows, error } = await supabase
    .from('items')
    .select('id, user_id, household_id, title, action_library_id, who_it_affects')
    .in('id', itemIds)
    .not('action_library_id', 'is', null);
  if (error || !rows?.length) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const knowledge = await loadFamilyKnowledge(user.id);
  const store = emptyActionFactsStore();
  store.facts = knowledge.facts.map((row) => ({ ...row }));

  const names = [...new Set(rows.map((row) => (row.who_it_affects || '').trim()).filter(Boolean))];
  const { data: members } = names.length
    ? await supabase.from('family_members').select('id, first_name').in('first_name', names)
    : { data: [] as { id: string; first_name: string | null }[] };

  for (const row of rows as {
    user_id: string;
    household_id: string | null;
    title: string | null;
    action_library_id: string;
    who_it_affects: string | null;
  }[]) {
    const who = (row.who_it_affects || '').trim().toLowerCase();
    const person = ((members ?? []) as { id: string; first_name: string | null }[]).find(
      (member) => (member.first_name || '').trim().toLowerCase() === who,
    );
    const knownIds = new Set(store.facts.map((fact) => fact.id));
    const fact = confirmActionLibraryCompletion({
      store,
      actionId: row.action_library_id,
      actionName: row.title || row.action_library_id,
      personId: person?.id ?? null,
      userId: row.user_id || user.id,
      householdId: row.household_id ?? knowledge.householdId,
      id: crypto.randomUUID(),
    });
    if (knownIds.has(fact.id)) await persistFactStatus(supabase, fact);
    else await persistFactRow(supabase, fact);
  }
}
