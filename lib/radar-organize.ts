import { looksLikeGroceryProduct, looksLikeShoppingList } from './shopping';

export type StandaloneKind = 'shopping' | 'todo' | 'radar';

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
  return USER_SOURCES.has(source);
}

export function isListHubTitle(title?: string | null): boolean {
  const t = (title || '').trim().toLowerCase();
  return t === 'shopping' || t === 'general to do' || looksLikeShoppingList(title || '');
}

export type PrepChildStatus = { status?: string | null };

function unwrapPrepChildren(
  children: PrepChildStatus[] | PrepChildStatus | null | undefined,
): PrepChildStatus[] {
  if (!children) return [];
  return Array.isArray(children) ? children : [children];
}

export function incompletePrepCount(
  children: PrepChildStatus[] | PrepChildStatus | null | undefined,
): number {
  return unwrapPrepChildren(children).filter(
    (row) => row.status !== 'done' && row.status !== 'dismissed' && row.status !== 'delegated',
  ).length;
}

export function nestedListCount(
  children: PrepChildStatus[] | PrepChildStatus | null | undefined,
): number {
  const rows = unwrapPrepChildren(children).filter((row) => row.status !== 'dismissed');
  if (!rows.length) return 0;
  return rows.filter((row) => row.status !== 'done' && row.status !== 'delegated').length;
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

function isInboxSource(source?: string | null): boolean {
  const s = (source || '').toLowerCase();
  return s === 'email' || s === 'calendar';
}

export function classifyStandaloneItem(item: {
  title?: string | null;
  event_date?: string | null;
  checklistCount?: number;
  source?: string | null;
  category?: string | null;
}): StandaloneKind {
  const title = item.title || '';
  if (looksLikeShoppingList(title)) return 'shopping';
  // Email/calendar keep nested prep on Home/Radar. Named lists are user-created only.
  if (isInboxSource(item.source)) return 'radar';
  if (looksLikeGroceryProduct(title, item.category)) return 'shopping';
  if (isSimpleUserTodo(item)) return 'todo';
  return 'radar';
}
