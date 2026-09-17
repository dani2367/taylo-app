type HouseholdClient = {
  from: (table: string) => any;
};

export const ITEM_VISIBILITY = {
  private: 'private',
  shared: 'shared',
} as const;

export type ItemVisibility = (typeof ITEM_VISIBILITY)[keyof typeof ITEM_VISIBILITY];

export type ViewerContext = {
  userId: string;
  householdId: string;
};

export type VisibilityFields = {
  id: string;
  created_by: string | null;
  household_id: string | null;
  visibility: ItemVisibility | string | null;
  who_it_affects?: string | null;
  status?: string | null;
};

/** New items are private to the creator. Sharing is an explicit later action. */
export function defaultItemVisibility(): ItemVisibility {
  return ITEM_VISIBILITY.private;
}

/** Groceries are a household list — both logins see the same shopping. */
export function defaultShoppingVisibility(): ItemVisibility {
  return defaultListVisibility('shopping');
}

const HOUSEHOLD_LIST_TITLES = new Set(['general to do', 'shopping']);

/** Shopping and General to do are household lists. Named lists stay private until shared. */
export function isHouseholdList(type?: string | null, title?: string | null): boolean {
  const kind = (type || '').trim().toLowerCase();
  const name = (title || '').trim().toLowerCase();
  return kind === 'shopping' || kind === 'todo' || HOUSEHOLD_LIST_TITLES.has(name);
}

export function defaultListVisibility(type?: string | null, title?: string | null): ItemVisibility {
  return isHouseholdList(type, title) ? ITEM_VISIBILITY.shared : ITEM_VISIBILITY.private;
}

export type WhoHousehold = {
  userName: string | null;
  children: string[];
  partner: string | null;
};

const FAMILY_WHO = new Set([
  'family',
  'whole family',
  'everyone',
  'household',
  'all',
  'shared',
  'both',
  'us',
]);
const SELF_WHO = new Set(['you', 'me', 'mum', 'mom', 'dad', 'parent']);

function normalizeWhoName(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase().replace(/['’]s\b/g, '').replace(/\s+/g, ' ');
}

function whoMentionsName(who: string, name: string): boolean {
  const needle = normalizeWhoName(name);
  if (!needle) return false;
  const tokens = who.split(/[\s,/&+]+/).map((token) => token.replace(/[^a-z]/g, '')).filter(Boolean);
  const key = needle.replace(/[^a-z]/g, '');
  if (who === needle || tokens.includes(key)) return true;
  return who.includes(needle);
}

/** Shared when the item is about a child, the partner, or the whole family. Own / unknown stay private. */
export function defaultVisibilityForWho(
  who: string | null | undefined,
  household: WhoHousehold,
): ItemVisibility {
  const value = normalizeWhoName(who);
  if (!value) return ITEM_VISIBILITY.private;
  if (SELF_WHO.has(value)) return ITEM_VISIBILITY.private;
  if (FAMILY_WHO.has(value)) return ITEM_VISIBILITY.shared;
  if (household.userName && whoMentionsName(value, household.userName)) return ITEM_VISIBILITY.private;
  for (const child of household.children) {
    if (whoMentionsName(value, child)) return ITEM_VISIBILITY.shared;
  }
  if (household.partner && whoMentionsName(value, household.partner)) return ITEM_VISIBILITY.shared;
  return ITEM_VISIBILITY.private;
}

export function newItemVisibilityFields(
  createdBy: string,
  householdId: string,
  visibility: ItemVisibility = defaultItemVisibility(),
) {
  return {
    created_by: createdBy,
    household_id: householdId,
    visibility,
  };
}

export function isItemVisibility(value: string | null | undefined): value is ItemVisibility {
  return value === ITEM_VISIBILITY.private || value === ITEM_VISIBILITY.shared;
}

export function itemVisibilityOf(item: Pick<VisibilityFields, 'visibility'>): ItemVisibility {
  return isItemVisibility(item.visibility) ? item.visibility : defaultItemVisibility();
}

export function isVisibleToMember(
  item: VisibilityFields,
  viewer: ViewerContext,
): boolean {
  if (item.created_by === viewer.userId) return true;
  return itemVisibilityOf(item) === ITEM_VISIBILITY.shared && item.household_id === viewer.householdId;
}

export function itemsVisibleToMember<T extends VisibilityFields>(
  items: T[],
  viewer: ViewerContext,
): T[] {
  return items.filter((item) => isVisibleToMember(item, viewer));
}

/** Share / unshare. Never copies the row and never touches who_it_affects. */
export function visibilityPatch(visibility: ItemVisibility): { visibility: ItemVisibility } {
  return { visibility };
}

export function shareItem<T extends VisibilityFields>(item: T): T {
  return { ...item, visibility: ITEM_VISIBILITY.shared };
}

export function completeItem<T extends VisibilityFields>(item: T): T {
  return { ...item, status: 'done' };
}

type FilterableQuery<T> = {
  eq: (column: string, value: string) => T;
  or: (filters: string) => T;
};

export function restrictVisibleItems<T extends FilterableQuery<T>>(query: T, viewer: ViewerContext): T {
  return query.or(
    `created_by.eq.${viewer.userId},and(visibility.eq.${ITEM_VISIBILITY.shared},household_id.eq.${viewer.householdId})`,
  );
}

/** Own lists, plus household-shared lists such as Shopping. */
export function restrictVisibleCollections<T extends FilterableQuery<T>>(query: T, viewer: ViewerContext): T {
  return query.or(
    `user_id.eq.${viewer.userId},and(visibility.eq.${ITEM_VISIBILITY.shared},household_id.eq.${viewer.householdId})`,
  );
}

/** Own family rows, plus children that belong to the shared household. */
export function restrictHouseholdFamilyMembers<T extends FilterableQuery<T>>(query: T, viewer: ViewerContext): T {
  return query.or(
    `user_id.eq.${viewer.userId},and(household_id.eq.${viewer.householdId},role.eq.child)`,
  );
}

export async function loadViewerContext(
  supabase: HouseholdClient,
  userId: string,
): Promise<ViewerContext> {
  const existing = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .maybeSingle();
  const current = (existing.data as { household_id?: string | null } | null)?.household_id;
  if (current) return { userId, householdId: current };

  const { data: created, error: createError } = await supabase.from('households').insert({}).select('id').single();
  if (createError || !created?.id) {
    const retry = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .maybeSingle();
    const hid = (retry.data as { household_id?: string | null } | null)?.household_id;
    if (hid) return { userId, householdId: hid };
    throw new Error(createError?.message || 'Could not create household');
  }

  const { error: memberError } = await supabase.from('household_members').insert({
    household_id: created.id,
    user_id: userId,
  });
  if (memberError) {
    const retry = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .maybeSingle();
    const hid = (retry.data as { household_id?: string | null } | null)?.household_id;
    if (hid) return { userId, householdId: hid };
    throw new Error(memberError.message);
  }

  await supabase.from('profiles').update({ household_id: created.id }).eq('id', userId);
  return { userId, householdId: created.id };
}
