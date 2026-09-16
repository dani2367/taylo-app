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
  newItemVisibilityFields,
  restrictHouseholdFamilyMembers,
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

export function visibleFamilyMembersSelect(select: string, viewer: ViewerContext) {
  return restrictHouseholdFamilyMembers(supabase.from('family_members').select(select), viewer);
}

export async function persistItemVisibility(itemId: string, visibility: ItemVisibility) {
  return supabase.from('items').update(visibilityPatch(visibility)).eq('id', itemId);
}
