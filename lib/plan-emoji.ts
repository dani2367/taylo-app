export function planEmoji(opts: {
  title?: string | null;
  category?: string | null;
  collectionType?: string | null;
  stored?: string | null;
}): string {
  if (opts.collectionType === 'shopping') return '🛒';
  if (opts.collectionType === 'trip') return '✈️';

  const blob = `${opts.title || ''} ${opts.category || ''}`.toLowerCase();

  if (/\b(birthday|bday)\b/.test(blob)) return '🎂';
  if (/\b(present|gift|card)\b/.test(blob) && !/\bpermission\b/.test(blob)) return '🎁';
  if (/\b(ticket|tickets|panto)\b/.test(blob)) return '🎟️';
  if (/\b(dentist|dental|teeth|orthodont)\b/.test(blob)) return '🦷';
  if (/\b(flight|holiday|travel|trip|passport|suitcase)\b/.test(blob)) return '✈️';
  if (/\b(call|phone|ring)\b/.test(blob)) return '📞';
  if (/\b(permission|ofsted|admin|form|paperwork)\b/.test(blob)) return '📝';
  if (/\b(school|teacher|nursery|homework|uniform|pe kit)\b/.test(blob)) return '🏫';
  if (/\b(bill|invoice|pay|payment|council tax|rent|mortgage)\b/.test(blob)) return '💳';
  if (/\b(shop|shopping|grocery|groceries|tesco|sainsbury|waitrose|asda|aldi|lidl)\b/.test(blob)) {
    return '🛒';
  }
  if (/\b(home|laundry|bins|dishwasher|garden|boiler|clean)\b/.test(blob)) return '🏠';

  if (opts.collectionType === 'event') return '🎂';

  const byCategory: Record<string, string> = {
    school: '🏫',
    activity: '🎟️',
    delivery: '📦',
    returns: '↩️',
    financial: '💳',
    errand: '🛒',
    home: '🏠',
  };
  const category = (opts.category || '').toLowerCase();
  if (byCategory[category]) return byCategory[category];

  const stored = (opts.stored || '').trim();
  if (stored) return stored.slice(0, 8);
  return '📌';
}
