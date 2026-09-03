const MAX_LABELS = 24;
const MAX_LABEL_LEN = 40;

const SHOPPING_TITLE_RE =
  /\b(shop(?:ping)?(?:\s+list)?|grocer(?:y|ies)?|tesco|sainsbury'?s?|waitrose|asda|aldi|lidl|morrisons|iceland|co-?op)\b/i;

const GROCERY_RE = /\b(?:need to |need |gotta |have to |must )?(?:buy|pick\s*up)\b/i;

const NEED_ITEM_RE =
  /\b(?:i\s+)?(?:need|want|get|grab)\s+(?:some\s+|a\s+|an\s+)?(?!to\b|help\b)/i;

const NOT_GROCERY_RE =
  /\b(present|gift|birthday|party|appointment|dentist|doctor|teacher|email|call|book|haircut|babysitter)\b/i;

export function looksLikeShoppingList(title: string): boolean {
  return SHOPPING_TITLE_RE.test(title);
}

export function isGroceryCapture(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (looksLikeShoppingList(t) || GROCERY_RE.test(t)) {
    return !/\b(present|gift|birthday|party)\b/i.test(t) || looksLikeShoppingList(t);
  }
  if (/\bneed to\b/i.test(t) || NOT_GROCERY_RE.test(t)) return false;
  return NEED_ITEM_RE.test(t);
}

export function shoppingListTitle(text: string): string {
  const named = text.match(
    /\b(tesco|sainsbury'?s?|waitrose|asda|aldi|lidl|morrisons|iceland|co-?op)\b/i,
  );
  if (named) {
    const shop = named[1];
    return shop.charAt(0).toUpperCase() + shop.slice(1);
  }
  return 'Shopping';
}

export function groceryLabelsFromText(text: string): string[] {
  const match = text.match(/(?:buy|pick\s*up|get|grab)\s+(?:some\s+)?(.+)/i) ||
    text.match(/\bneed\s+(?:some\s+)?(?!to\b)(.+)/i);
  const chunk = (match?.[1] || text).replace(/[.!?]+$/, '').trim();
  return parseLabels(
    chunk.split(/\s*(?:,|&| and )\s*/i).map((part) => cleanGroceryProductLabel(part)),
  );
}

function cleanGroceryProductLabel(raw: string): string {
  let label = raw.replace(/\s+/g, ' ').trim().replace(/^[.!?]+|[.!?]+$/g, '');
  for (let i = 0; i < 3; i += 1) {
    const next = label
      .replace(/^(?:i\s+)?(?:just\s+)?(?:need to |need |want to |want |gotta |have to |must )\s*/i, '')
      .replace(/^(?:to\s+)?(?:buy|get|grab|pick\s*up)\s+/i, '')
      .replace(/^(?:some|a|an|the)\s+/i, '')
      .trim();
    if (next === label) break;
    label = next;
  }
  label = label.replace(/\s+for\s+.+$/i, '').trim();
  if (!label || looksLikeShoppingList(label)) return '';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseLabels(values: string[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of values) {
    const label = raw.replace(/\s+/g, ' ').trim().replace(/^(buy|get|pick\s*up)\s+/i, '');
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label.slice(0, MAX_LABEL_LEN));
    if (labels.length >= MAX_LABELS) break;
  }
  return labels;
}
