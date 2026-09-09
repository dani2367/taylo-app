const WEEKDAYS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'your',
  'have',
  'need',
  'needs',
  'named',
  'piece',
  'into',
  'will',
  'week',
  'today',
  'tomorrow',
  'return',
  'please',
  'bring',
]);

export function looksLikeMentalLoad(text: string | null | undefined): boolean {
  return /\b(due|dentist|jab|jabs|immunis|vaccine|clothes|shoe|size|haircut|optician|is it time|might be|probably due|next size|trousers|trainers|uniform|car seat|wellies)\b/i.test(
    text || '',
  );
}

export function isUsableInsight(raw: string | null | undefined): boolean {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  const watching = /keep(ing)? (an )?eye|worth (keeping|watching)\b/i.test(text);
  const practical =
    /\b(confirm|add|start|book|pack|kit|present|snack|send|call|reply|form|photo|order|check|talk you through|if you want|tonight|this week|weekend|saturday|sunday|radar|suspect|due|size|dentist|jab|jabs|clothes|haircut|optician)\b/i.test(
      text,
    );
  if (watching && !practical) return false;
  return true;
}

export function isVagueNoticed(text: string): boolean {
  if (/busy (week|day)|nothing (much )?to (report|flag)|all (looks )?good|here's what|today's actions/i.test(text)) {
    return true;
  }
  const watching = /keep(ing)? (an )?eye|worth (keeping|watching)/i.test(text);
  const specific =
    /\b(dentist|jab|jabs|immunis|vaccine|clothes|shoe|size|haircut|car seat|helmet|wellies|optician|appointment|birthday|nursery|school|passport|hair|trousers|trainers|uniform)\b/i.test(
      text,
    );
  if (watching && !specific) return true;
  if (/on the radar/i.test(text) && !specific) return true;
  return false;
}

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(WEEKDAYS, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP.has(word));
}

/** True when the insight restates an item already captured on their lists. */
export function insightRepeatsCaptured(text: string | null | undefined, titles: string[]): boolean {
  const hay = (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!hay) return false;
  for (const title of titles) {
    const normalised = (title || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalised.length >= 8 && hay.includes(normalised)) return true;
    const tokens = titleTokens(title || '');
    if (!tokens.length) continue;
    const hits = tokens.filter((token) => hay.includes(token));
    if (hits.length >= 2) return true;
  }
  return false;
}
