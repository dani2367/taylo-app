import { supabase } from '@/lib/supabase';
import { classifyStandaloneItem, isListHubTitle } from '@/lib/radar-organize';
import { looksLikeGroceryProduct, looksLikeShoppingList } from '@/lib/shopping';
import { narrativeFromSourceEmail } from '@/lib/email-narrative';
import { defaultListVisibility, defaultShoppingVisibility, viewerForUser, visibleCollectionsSelect, visibleItemsSelect } from '@/lib/item-visibility';

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

async function lookupTodoCollection(userId: string): Promise<string | null> {
  const { data: byTitle } = await supabase
    .from('collections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('title', GENERAL_TODO_TITLE)
    .maybeSingle();
  if (byTitle?.id) return byTitle.id as string;

  const { data: byType } = await supabase
    .from('collections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('type', 'todo')
    .maybeSingle();
  return (byType?.id as string | undefined) ?? null;
}

export async function findOrCreateTodoCollection(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_or_create_todo_collection', {
    p_user_id: userId,
  });
  if (data) return data as string;
  const existing = await lookupTodoCollection(userId);
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from('collections')
    .insert({
      user_id: userId,
      title: GENERAL_TODO_TITLE,
      emoji: DEFAULT_LIST_EMOJI,
      type: 'todo',
      status: 'active',
      visibility: defaultListVisibility('todo', GENERAL_TODO_TITLE),
    })
    .select('id')
    .single();
  if (created?.id) return created.id as string;

  const raced = await lookupTodoCollection(userId);
  if (raced) return raced;

  console.error('Failed to find to-do collection:', error?.message || createError?.message);
  return null;
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
      visibility: defaultListVisibility('custom', name),
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
  const { data: children } = await supabase.from('items').select('id').in('parent_id', itemIds);
  const childIds = ((children as { id: string }[] | null) ?? []).map((row) => row.id);
  const ids = [...new Set([...itemIds, ...childIds])];
  // collection_id is what keeps these off Home/Radar (`isListBound`). Kind stays obligation.
  // Do not force status open — Done / Dismissed must stick.
  const { error } = await supabase
    .from('items')
    .update({ collection_id: collectionId, kind: 'obligation' })
    .in('id', ids)
    .eq('status', 'open');
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
    .select('id, title, visibility')
    .eq('collection_id', collectionId)
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  const open = ((existing as { id: string; title: string | null; visibility?: string | null }[] | null) ?? []);
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
        who_it_affects: 'family',
        visibility: defaultShoppingVisibility(),
      })
      .select('id, title')
      .single();
    if (error || !created) return error?.message || 'Failed to save shopping list';
    list = created;
  } else if (list.visibility !== 'shared') {
    await supabase
      .from('items')
      .update({ visibility: defaultShoppingVisibility(), who_it_affects: 'family' })
      .or(`id.eq.${list.id},parent_id.eq.${list.id}`);
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
  _itemTitle: string,
  labels: string[],
): Promise<string | null> {
  const unique = [...new Map(labels.map((label) => [label.toLowerCase(), label])).values()];
  if (!unique.length) return null;

  const [{ data: parent }, { data: existing }] = await Promise.all([
    supabase.from('items').select('source, source_label, category, who_it_affects, visibility').eq('id', itemId).maybeSingle(),
    supabase.from('items').select('title').eq('parent_id', itemId),
  ]);

  const seen = new Set(
    ((existing as { title: string | null }[] | null) ?? [])
      .map((row) => (row.title || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const toAdd = unique.filter((label) => !seen.has(label.toLowerCase()));
  if (!toAdd.length) return null;

  const source =
    parent?.source && ['email', 'chat', 'manual', 'calendar'].includes(parent.source)
      ? parent.source
      : 'manual';

  const { error } = await supabase.from('items').insert(
    toAdd.map((title) => ({
      user_id: userId,
      parent_id: itemId,
      title,
      status: 'open',
      kind: 'list_item',
      confidence: 'high',
      prep_origin: 'none',
      due_at: null,
      source,
      source_label: parent?.source_label ?? 'Prep',
      category: parent?.category ?? 'errand',
      who_it_affects: parent?.who_it_affects ?? null,
      visibility: parent?.visibility === 'shared' ? 'shared' : defaultShoppingVisibility(),
    })),
  );
  return error?.message ?? null;
}

export async function listActiveCollections(userId: string): Promise<CollectionRow[]> {
  const viewer = await viewerForUser(userId);
  const { data, error } = await visibleCollectionsSelect(
    'id, user_id, title, emoji, type, status, created_at',
    viewer,
  )
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to list collections:', error.message);
    return [];
  }
  return sortPlanLists((data ?? []) as CollectionRow[]);
}

function isAutoList(row: CollectionRow): boolean {
  return row.type === 'shopping' || row.type === 'todo' || row.title === GENERAL_TODO_TITLE;
}

async function collectionHasOpenWork(col: CollectionRow): Promise<boolean> {
  if (col.type === 'shopping') {
    const { data: hubs } = await supabase
      .from('items')
      .select('id')
      .eq('collection_id', col.id)
      .eq('status', 'open');
    const hubIds = ((hubs as { id: string }[] | null) ?? []).map((row) => row.id);
    if (!hubIds.length) return false;
    const { data: kids } = await supabase.from('items').select('id').in('parent_id', hubIds).eq('status', 'open');
    return ((kids as { id: string }[] | null) ?? []).length > 0;
  }

  const { data } = await supabase
    .from('items')
    .select('id, title')
    .eq('collection_id', col.id)
    .eq('status', 'open')
    .is('parent_id', null);
  return ((data as { id: string; title: string | null }[] | null) ?? []).some((row) => !isListHubTitle(row.title));
}

async function completeCollection(collectionId: string): Promise<void> {
  const { data: members } = await supabase.from('items').select('id').eq('collection_id', collectionId);
  const memberIds = ((members as { id: string }[] | null) ?? []).map((row) => row.id);
  if (memberIds.length) {
    const { data: children } = await supabase.from('items').select('id').in('parent_id', memberIds);
    const ids = [...new Set([...memberIds, ...((children as { id: string }[] | null) ?? []).map((row) => row.id)])];
    await supabase.from('items').update({ status: 'done' }).in('id', ids).eq('status', 'open');
  }
  await supabase.from('collections').update({ status: 'completed' }).eq('id', collectionId);
}

/** Drop Shopping / General to do when nothing open is left on them. */
export async function retireEmptyCollections(userId: string): Promise<void> {
  const collections = await listActiveCollections(userId);
  for (const col of collections) {
    if (!isAutoList(col)) continue;
    if (await collectionHasOpenWork(col)) continue;
    await completeCollection(col.id);
  }
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

type PrepJoin = { id: string }[] | { id: string } | null;
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
  kind: string | null;
  collection_id: string | null;
  prep_children: PrepJoin;
  collections: { title: string | null; type: string | null } | { title: string | null; type: string | null }[] | null;
};

function prepCount(raw: PrepJoin): number {
  if (!raw) return 0;
  return Array.isArray(raw) ? raw.length : 1;
}

function isHubItem(title: string | null): boolean {
  return isListHubTitle(title);
}

/** Prep lines stay open after the parent event is dismissed — they must not return to Home. */
async function closeChildrenOfClosedParents(userId: string): Promise<void> {
  const { data: closedParents, error } = await supabase
    .from('items')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['done', 'dismissed', 'delegated']);
  if (error) {
    console.warn('Failed to load closed parents:', error.message);
    return;
  }
  const parentIds = ((closedParents as { id: string }[] | null) ?? []).map((row) => row.id);
  if (!parentIds.length) return;
  const { error: childError } = await supabase
    .from('items')
    .update({ status: 'dismissed' })
    .eq('user_id', userId)
    .eq('status', 'open')
    .in('parent_id', parentIds);
  if (childError) console.error('Failed to close leftover children:', childError.message);
}

/** Put loose to-dos and nested checklists onto list collections. */
export async function organizeStandaloneItems(userId: string): Promise<void> {
  await closeChildrenOfClosedParents(userId);

  const { data, error } = await supabase
    .from('items')
    .select('id, title, body, detail, suggestion, action_description, event_date, source, category, kind, collection_id, collections(title, type), prep_children:items!parent_id(id)')
    .eq('user_id', userId)
    .eq('status', 'open')
    .is('parent_id', null)
    .neq('source', 'calendar');

  if (error) {
    console.error('Failed to load items to organise:', error.message);
    return;
  }

  const rows = (data as StandaloneRow[] | null) ?? [];
  if (!rows.length) {
    await retireEmptyCollections(userId);
    return;
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

  for (const row of rows) {
    if (isHubItem(row.title)) continue;
    const kind = classifyStandaloneItem({
      title: row.title,
      event_date: row.event_date,
      source: row.source,
      category: row.category,
      kind: row.kind,
      checklistCount: prepCount(row.prep_children),
    });
    const label = (row.title || '').trim();
    if (kind === 'shopping') {
      if (label) shoppingLabels.push(label);
      shoppingDone.push(row.id);
    } else if (kind === 'todo') {
      todoIds.push(row.id);
    } else if (row.collection_id) {
      unassign.push(row.id);
    }
  }

  if (unassign.length) {
    await supabase.from('items').update({ collection_id: null }).in('id', unassign);
  }

  await completeEmptyCustomCollections(userId);

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

  const { data: shopCol } = await supabase
    .from('collections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('type', 'shopping')
    .maybeSingle();
  if (shopCol?.id) {
    const { data: hubs } = await supabase
      .from('items')
      .select('id')
      .eq('collection_id', shopCol.id)
      .eq('status', 'open');
    const hubIds = ((hubs as { id: string }[] | null) ?? []).map((row) => row.id);
    if (hubIds.length) {
      const { data: children } = await supabase
        .from('items')
        .select('id, title, source, category')
        .in('parent_id', hubIds)
        .eq('status', 'open');
      const childRows =
        (children as { id: string; title: string | null; source: string | null; category: string | null }[] | null) ??
        [];
      const strayChildren = childRows.filter(
        (row) =>
          !looksLikeGroceryProduct(row.title || '', row.category) &&
          classifyStandaloneItem({ title: row.title, source: row.source || 'chat', category: row.category }) !==
            'shopping',
      );
      if (strayChildren.length) {
        const strayIds = strayChildren.map((row) => row.id);
        await supabase
          .from('items')
          .update({ parent_id: null, kind: 'obligation', collection_id: null })
          .in('id', strayIds);
        await addTasksToTodoList(userId, strayIds);
      }
    }
  }

  await retireEmptyCollections(userId);
}

async function completeEmptyCustomCollections(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('collections')
    .select('id, title, type, created_at')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) {
    console.error('Failed to load collections to prune:', error.message);
    return;
  }

  const graceMs = 15 * 60 * 1000;
  const cutoff = Date.now() - graceMs;
  const candidates = ((data as CollectionRow[] | null) ?? []).filter((row) => {
    if (row.type !== 'custom' || row.title === GENERAL_TODO_TITLE) return false;
    return new Date(row.created_at).getTime() < cutoff;
  });
  if (!candidates.length) return;

  const { data: members } = await supabase
    .from('items')
    .select('collection_id')
    .eq('user_id', userId)
    .eq('status', 'open')
    .is('parent_id', null)
    .in(
      'collection_id',
      candidates.map((row) => row.id),
    );
  const occupied = new Set(
    ((members as { collection_id: string | null }[] | null) ?? [])
      .map((row) => row.collection_id)
      .filter((id): id is string => Boolean(id)),
  );
  const drop = candidates.filter((row) => !occupied.has(row.id)).map((row) => row.id);
  if (!drop.length) return;

  await supabase.from('collections').update({ status: 'completed' }).in('id', drop);
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
