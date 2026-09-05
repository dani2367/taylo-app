import { supabase } from '@/lib/supabase';
import { classifyStandaloneItem, isListHubTitle, simpleListTitle } from '@/lib/radar-organize';
import { groceryLabelsFromText, looksLikeGroceryProduct, looksLikeShoppingList } from '@/lib/shopping';
import { narrativeFromSourceEmail } from '@/lib/email-narrative';

export type CollectionType = 'shopping' | 'event' | 'trip' | 'other' | 'custom' | 'todo';

export type CollectionRow = {
  id: string;
  user_id: string;
  title: string;
  emoji: string | null;
  type: CollectionType;
  status: 'active' | 'completed';
  created_at: string;
};

export const DEFAULT_LIST_EMOJI = '📝';
export const GENERAL_TODO_TITLE = 'General to do';

export async function findOrCreateTodoCollection(userId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('collections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('title', GENERAL_TODO_TITLE)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { collection, error } = await createCustomCollection(userId, GENERAL_TODO_TITLE, DEFAULT_LIST_EMOJI);
  if (error || !collection) {
    console.error('Failed to find to-do collection:', error);
    return null;
  }
  return collection.id;
}

export async function createCustomCollection(
  userId: string,
  title: string,
  emoji?: string | null,
): Promise<{ collection: CollectionRow | null; error: string | null }> {
  const name = title.replace(/\s+/g, ' ').trim();
  if (!name) return { collection: null, error: 'Give the list a name first.' };
  const { data, error } = await supabase
    .from('collections')
    .insert({
      user_id: userId,
      title: name,
      emoji: (emoji || DEFAULT_LIST_EMOJI).trim() || DEFAULT_LIST_EMOJI,
      type: 'custom',
      status: 'active',
    })
    .select('id, user_id, title, emoji, type, status, created_at')
    .single();
  if (error || !data) return { collection: null, error: error?.message || 'Could not create that list.' };
  return { collection: data as CollectionRow, error: null };
}

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

export async function addTasksToTodoList(userId: string, itemIds: string[]): Promise<string | null> {
  const collectionId = await findOrCreateTodoCollection(userId);
  if (!collectionId) return 'Failed to save to-do list';
  if (!itemIds.length) return null;
  const { error } = await supabase
    .from('items')
    .update({ collection_id: collectionId, status: 'open' })
    .in('id', itemIds);
  return error?.message ?? null;
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
        suggestion: 'Tell me what you still need and I can add it to the list.',
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
  const groceryExtras = extras.filter((row) => looksLikeGroceryProduct(row.title || ''));
  const strayExtras = extras.filter((row) => !looksLikeGroceryProduct(row.title || ''));
  const extraLabels = groceryExtras
    .map((row) => (row.title || '').trim())
    .filter((title) => title && !looksLikeShoppingList(title));
  if (groceryExtras.length) {
    await supabase.from('items').update({ status: 'done' }).in('id', groceryExtras.map((row) => row.id));
  }
  if (strayExtras.length) {
    await addTasksToTodoList(
      userId,
      strayExtras.map((row) => row.id),
    );
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
  return sortPlanLists((data ?? []) as CollectionRow[]);
}

function sortPlanLists(rows: CollectionRow[]): CollectionRow[] {
  const rank = (row: CollectionRow) => {
    if (row.type === 'shopping') return 0;
    if (row.type === 'todo' || row.title === GENERAL_TODO_TITLE) return 1;
    return 2;
  };
  return [...rows].sort((a, b) => {
    const byType = rank(a) - rank(b);
    if (byType !== 0) return byType;
    return a.created_at.localeCompare(b.created_at);
  });
}

type ChecklistJoin = { title?: string | null; checklist_items: { id: string }[] | null };
type StandaloneRow = {
  id: string;
  title: string | null;
  body: string | null;
  detail: string | null;
  suggestion: string | null;
  action_description: string | null;
  event_date: string | null;
  source: string | null;
  category: string | null;
  collection_id: string | null;
  checklists: ChecklistJoin[] | ChecklistJoin | null;
  collections: { title: string | null; type: string | null } | { title: string | null; type: string | null }[] | null;
};

function firstChecklist(raw: StandaloneRow['checklists']): ChecklistJoin | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function checklistCount(raw: StandaloneRow['checklists']): number {
  const lists = !raw ? [] : Array.isArray(raw) ? raw : [raw];
  return lists.reduce((n, list) => n + (list.checklist_items?.length ?? 0), 0);
}

function originalListItemTitle(row: StandaloneRow): string | null {
  const stored = firstChecklist(row.checklists)?.title?.replace(/\s+/g, ' ').trim() || '';
  const current = (row.title || '').replace(/\s+/g, ' ').trim();
  if (!stored || stored === current) return null;
  if (isHubItem(stored) || isHubItem(current)) return null;
  if (current === simpleListTitle(stored) || simpleListTitle(current) === simpleListTitle(stored)) {
    return stored;
  }
  return null;
}

function isHubItem(title: string | null): boolean {
  return isListHubTitle(title);
}

async function removeShoppingChecklistCopies(collectionId: string, titles: string[]): Promise<void> {
  const needles = new Set<string>();
  for (const title of titles) {
    const t = title.replace(/\s+/g, ' ').trim().toLowerCase();
    if (t) needles.add(t);
    for (const label of groceryLabelsFromText(title)) {
      needles.add(label.toLowerCase());
    }
  }
  if (!needles.size) return;

  const { data: hubs } = await supabase
    .from('items')
    .select('id')
    .eq('collection_id', collectionId)
    .eq('status', 'open');
  const hubIds = ((hubs as { id: string }[] | null) ?? []).map((row) => row.id);
  if (!hubIds.length) return;

  const { data: lists } = await supabase
    .from('checklists')
    .select('id, checklist_items(id, text)')
    .in('item_id', hubIds);

  const drop: string[] = [];
  for (const list of (lists as { checklist_items?: { id: string; text: string }[] | null }[] | null) ?? []) {
    for (const entry of list.checklist_items ?? []) {
      const text = (entry.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!text) continue;
      if (text.length < 4) continue;
      if (needles.has(text) || [...needles].some((needle) => needle.length >= 4 && (needle.includes(text) || text.includes(needle)))) {
        drop.push(entry.id);
      }
    }
  }
  if (drop.length) {
    await supabase.from('checklist_items').delete().in('id', drop);
  }
}

/** Put loose to-dos and nested checklists onto list collections. */
export async function organizeStandaloneItems(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('items')
    .select('id, title, body, detail, suggestion, action_description, event_date, source, category, collection_id, collections(title, type), checklists(title, checklist_items(id))')
    .eq('user_id', userId)
    .eq('status', 'open')
    .neq('source', 'calendar');

  if (error) {
    console.error('Failed to load items to organise:', error.message);
    return;
  }

  const rows = (data as StandaloneRow[] | null) ?? [];
  if (!rows.length) return;

  for (const row of rows) {
    const restored = originalListItemTitle(row);
    if (!restored) continue;
    await supabase.from('items').update({ title: restored }).eq('id', row.id);
    row.title = restored;
  }

  const missingCopy = rows.filter((row) => !isHubItem(row.title) && (!row.body || !row.detail));
  if (missingCopy.length) {
    const { data: emails } = await supabase
      .from('source_emails')
      .select('item_id, subject, body_text')
      .in(
        'item_id',
        missingCopy.map((row) => row.id),
      );
    const byItem = new Map(
      ((emails as { item_id: string | null; subject: string | null; body_text: string | null }[] | null) ?? [])
        .filter((row) => row.item_id)
        .map((row) => [row.item_id as string, row]),
    );
    for (const row of missingCopy) {
      const email = byItem.get(row.id);
      if (!email?.body_text) continue;
      const copy = narrativeFromSourceEmail({ subject: email.subject, body: email.body_text }, row.title);
      await supabase
        .from('items')
        .update({
          body: row.body || copy.body,
          detail: row.detail || copy.detail,
          suggestion: row.suggestion || copy.suggestion,
          action_description:
            row.action_description && row.action_description !== row.title
              ? row.action_description
              : copy.action_description || row.action_description,
        })
        .eq('id', row.id);
    }
  }

  const shoppingLabels: string[] = [];
  const shoppingDone: string[] = [];
  const todoIds: string[] = [];
  const unassign: string[] = [];
  const listRows: StandaloneRow[] = [];

  for (const row of rows) {
    if (isHubItem(row.title)) continue;
    const kind = classifyStandaloneItem({
      title: row.title,
      event_date: row.event_date,
      source: row.source,
      category: row.category,
      checklistCount: checklistCount(row.checklists),
    });
    const label = (row.title || '').trim();
    if (kind === 'shopping') {
      if (label) shoppingLabels.push(label);
      shoppingDone.push(row.id);
    } else if (kind === 'todo') {
      todoIds.push(row.id);
    } else if (kind === 'list') {
      listRows.push(row);
    } else if (row.collection_id) {
      const meta = unwrapCollection(row.collections);
      if (meta?.title === GENERAL_TODO_TITLE || meta?.type === 'todo') unassign.push(row.id);
    }
  }

  if (unassign.length) {
    await supabase.from('items').update({ collection_id: null }).in('id', unassign);
  }

  if (shoppingLabels.length || shoppingDone.length) {
    const err = await addProductsToShoppingList(userId, shoppingLabels);
    if (err) console.error('Failed to fold shopping items:', err);
    if (shoppingDone.length) {
      await supabase.from('items').update({ status: 'done' }).in('id', shoppingDone);
    }
  }

  if (todoIds.length) {
    const err = await addTasksToTodoList(userId, todoIds);
    if (err) console.error('Failed to fold to-dos:', err);
  }

  const { data: todoCol } = await supabase
    .from('collections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('title', GENERAL_TODO_TITLE)
    .maybeSingle();
  if (todoCol?.id) {
    const { data: closed } = await supabase
      .from('items')
      .select('id, title, category')
      .eq('user_id', userId)
      .eq('collection_id', todoCol.id)
      .eq('status', 'done');
    const reopen = ((closed as { id: string; title: string | null; category: string | null }[] | null) ?? [])
      .filter((row) => !isHubItem(row.title) && !looksLikeGroceryProduct(row.title || '', row.category))
      .map((row) => row.id);
    if (reopen.length) {
      await supabase.from('items').update({ status: 'open' }).in('id', reopen);
    }
  }

  const { data: shopCol } = await supabase
    .from('collections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('type', 'shopping')
    .maybeSingle();
  if (shopCol?.id) {
    const { data: closedShop } = await supabase
      .from('items')
      .select('id, title, category, source, collection_id')
      .eq('user_id', userId)
      .eq('status', 'done');
    const { data: hubs } = await supabase
      .from('items')
      .select('id')
      .eq('collection_id', shopCol.id)
      .eq('status', 'open');
    const hubIds = ((hubs as { id: string }[] | null) ?? []).map((row) => row.id);
    let shopLabels = new Set<string>();
    if (hubIds.length) {
      const { data: lists } = await supabase
        .from('checklists')
        .select('checklist_items(text)')
        .in('item_id', hubIds);
      shopLabels = new Set(
        ((lists as { checklist_items?: { text: string }[] | null }[] | null) ?? [])
          .flatMap((list) => list.checklist_items ?? [])
          .map((entry) => (entry.text || '').replace(/\s+/g, ' ').trim().toLowerCase())
          .filter(Boolean),
      );
    }

    const rescue = ((closedShop as { id: string; title: string | null; category: string | null; source: string | null; collection_id: string | null }[] | null) ?? []).filter(
      (row) => {
        if (isHubItem(row.title) || looksLikeGroceryProduct(row.title || '', row.category)) return false;
        if (row.collection_id === shopCol.id) return true;
        const labels = [row.title || '', ...groceryLabelsFromText(row.title || '')].map((value) =>
          value.replace(/\s+/g, ' ').trim().toLowerCase(),
        );
        return labels.some(
          (label) =>
            label.length >= 4 &&
            (shopLabels.has(label) || [...shopLabels].some((entry) => entry.length >= 4 && (entry.includes(label) || label.includes(entry)))),
        );
      },
    );
    if (rescue.length) {
      const rescueIds = rescue.map((row) => row.id);
      await supabase.from('items').update({ status: 'open' }).in('id', rescueIds);
      const todoRescue = rescue
        .filter(
          (row) =>
            classifyStandaloneItem({ title: row.title, source: row.source, category: row.category }) === 'todo',
        )
        .map((row) => row.id);
      if (todoRescue.length) {
        await addTasksToTodoList(userId, todoRescue);
      }
      await removeShoppingChecklistCopies(
        shopCol.id,
        rescue.map((row) => row.title || ''),
      );
    }
  }

  for (const row of listRows) {
    const name = simpleListTitle(row.title || 'List');
    let collectionId = row.collection_id;
    if (!collectionId) {
      const { collection } = await createCustomCollection(userId, name, DEFAULT_LIST_EMOJI);
      collectionId = collection?.id ?? null;
    } else {
      const meta = unwrapCollection(row.collections);
      if (meta?.title && meta.title !== name) {
        await supabase.from('collections').update({ title: name }).eq('id', collectionId);
      }
    }
    if (!collectionId) continue;
    await supabase.from('items').update({ collection_id: collectionId }).eq('id', row.id);
  }
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
