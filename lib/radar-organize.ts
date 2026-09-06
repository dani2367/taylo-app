import { looksLikeGroceryProduct, looksLikeShoppingList } from './shopping';

export const LIST_FROM_CHECKLIST_MIN = 2;

export type StandaloneKind = 'shopping' | 'list' | 'todo' | 'radar';

const USER_SOURCES = new Set(['chat', 'manual']);

const ADMIN_RE =
  /\b(book|rsvp|sign up|sign the|apply for|renew|confirm|appointment|checkup|permission|ofsted|passport)\b/i;

export function isPersonalPurchase(title?: string | null, category?: string | null): boolean {
  const t = title || '';
  if (!/\b(buy|get|pick\s*up|order)\b/i.test(t)) return false;
  if (looksLikeGroceryProduct(t, category)) return false;
  if (ADMIN_RE.test(t) && !/\b(call|text|phone)\b/i.test(t)) return false;
  return true;
}

export function isSimpleUserTodo(item: {
  title?: string | null;
  source?: string | null;
  event_date?: string | null;
  category?: string | null;
}): boolean {
  const title = item.title || '';
  if (isPersonalPurchase(title, item.category)) return true;
  const source = (item.source || '').toLowerCase();
  if (!USER_SOURCES.has(source)) return false;
  if (ADMIN_RE.test(title) && !/\b(call|text|phone)\b/i.test(title)) return false;
  return true;
}

export function isListHubTitle(title?: string | null): boolean {
  const t = (title || '').trim().toLowerCase();
  return t === 'shopping' || t === 'general to do' || looksLikeShoppingList(title || '');
}

export function incompleteChecklistCount(
  checklists:
    | { checklist_items?: { done?: boolean }[] | null }[]
    | { checklist_items?: { done?: boolean }[] | null }
    | null
    | undefined,
): number {
  const lists = !checklists ? [] : Array.isArray(checklists) ? checklists : [checklists];
  return lists.reduce(
    (n, list) => n + (list.checklist_items ?? []).filter((entry) => !entry.done).length,
    0,
  );
}

/** Radar shows items with a genuine open action. Calendar events with no follow-up stay on Schedule only. */
export function isRadarEligible(item: {
  title?: string | null;
  source?: string | null;
  action_description?: string | null;
  suggestion?: string | null;
  checklists?:
    | { checklist_items?: { done?: boolean }[] | null }[]
    | { checklist_items?: { done?: boolean }[] | null }
    | null;
}): boolean {
  if (isListHubTitle(item.title)) return false;
  if ((item.source || '').toLowerCase() !== 'calendar') return true;
  if (incompleteChecklistCount(item.checklists) > 0) return true;
  return Boolean(item.action_description?.trim() || item.suggestion?.trim());
}

export function simpleListTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(/^(please\s+)?/i, '');
  t = t.replace(
    /^(return|get|buy|sort|sign|complete|send|fill(?:\s+in|\s+out)?|organise|organize)\s+/i,
    '',
  );
  t = t.replace(/^(the|a|an)\s+/i, '');
  t = t.replace(/\s+(permission\s+slip|permission|form|checklist|letter)$/i, '');
  t = t.replace(/^(.+?)\s+a\s+party\s+present$/i, "$1's party");
  t = t.trim();
  if (!t) return raw.replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function classifyStandaloneItem(item: {
  title?: string | null;
  event_date?: string | null;
  checklistCount?: number;
  source?: string | null;
  category?: string | null;
}): StandaloneKind {
  const title = item.title || '';
  if (looksLikeShoppingList(title) || looksLikeGroceryProduct(title, item.category)) return 'shopping';
  if ((item.checklistCount ?? 0) >= LIST_FROM_CHECKLIST_MIN) return 'list';
  if (isSimpleUserTodo(item)) return 'todo';
  return 'radar';
}
