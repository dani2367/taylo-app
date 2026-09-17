export {
  ITEM_VISIBILITY,
  completeItem,
  defaultItemVisibility,
  isItemVisibility,
  isVisibleToMember,
  itemVisibilityOf,
  itemsVisibleToMember,
  loadViewerContext,
  defaultVisibilityForWho,
  defaultShoppingVisibility,
  defaultListVisibility,
  isHouseholdList,
  newItemVisibilityFields,
  restrictHouseholdFamilyMembers,
  restrictVisibleCollections,
  restrictVisibleItems,
  shareItem,
  visibilityPatch,
  type ItemVisibility,
  type ViewerContext,
  type VisibilityFields,
} from '../supabase/functions/_shared/item-visibility.ts';

import { supabase } from './supabase';
import {
  loadViewerContext,
  restrictVisibleCollections,
  restrictVisibleItems,
  restrictHouseholdFamilyMembers,
  visibilityPatch,
  type ItemVisibility,
  type ViewerContext,
} from '../supabase/functions/_shared/item-visibility.ts';

export async function viewerForUser(userId: string): Promise<ViewerContext> {
  return loadViewerContext(supabase, userId);
}

export function visibleItemsSelect(select: string, viewer: ViewerContext) {
  return restrictVisibleItems(supabase.from('items').select(select), viewer);
}

export function visibleCollectionsSelect(select: string, viewer: ViewerContext) {
  return restrictVisibleCollections(supabase.from('collections').select(select), viewer);
}

export function visibleFamilyMembersSelect(select: string, viewer: ViewerContext) {
  return restrictHouseholdFamilyMembers(supabase.from('family_members').select(select), viewer);
}

export async function persistItemVisibility(itemId: string, visibility: ItemVisibility) {
  const patch = visibilityPatch(visibility);
  const parent = await supabase.from('items').update(patch).eq('id', itemId);
  if (parent.error) return parent;
  const children = await supabase.from('items').update(patch).eq('parent_id', itemId);
  return children.error ? children : parent;
}

/** Share the list itself. Named lists also copy that onto their rows; household lists keep item-level who. */
export async function persistListVisibility(
  collectionId: string,
  visibility: ItemVisibility,
  syncItems: boolean,
) {
  const patch = visibilityPatch(visibility);
  const collection = await supabase.from('collections').update(patch).eq('id', collectionId);
  if (collection.error || !syncItems) return collection;
  const { data: members, error: memberError } = await supabase.from('items').select('id').eq('collection_id', collectionId);
  if (memberError) return { error: memberError };
  const memberIds = ((members as { id: string }[] | null) ?? []).map((row) => row.id);
  if (!memberIds.length) return collection;
  const { data: children, error: childError } = await supabase.from('items').select('id').in('parent_id', memberIds);
  if (childError) return { error: childError };
  const ids = [...new Set([...memberIds, ...((children as { id: string }[] | null) ?? []).map((row) => row.id)])];
  return supabase.from('items').update(patch).in('id', ids);
}
