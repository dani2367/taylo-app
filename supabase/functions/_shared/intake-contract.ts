/** Canonical intake fields written by AI classification across email, calendar, and chat. */

export const KINDS = ['occurrence', 'obligation', 'hold', 'list_item', 'context_only'] as const;
export const ACTIONABLE = ['yes', 'no', 'maybe'] as const;
export const PREP_IMPLIED = ['none', 'stated', 'inferred'] as const;
export const CONFIDENCE = ['high', 'medium', 'low'] as const;

export type IntakeKind = (typeof KINDS)[number];
export type Actionable = (typeof ACTIONABLE)[number];
export type PrepImplied = (typeof PREP_IMPLIED)[number];
export type Confidence = (typeof CONFIDENCE)[number];
export type IntakeSource = 'calendar' | 'email' | 'chat';

export type RawIntakeItem = {
  title?: unknown;
  kind?: unknown;
  occurs_at?: unknown;
  due_at?: unknown;
  actionable?: unknown;
  prep_implied?: unknown;
  prep_origin?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  surface_from?: unknown;
  surface_until?: unknown;
};

export type IntakeItem = {
  title: string;
  kind: IntakeKind;
  occurs_at: string | null;
  due_at: string | null;
  actionable: Actionable;
  prep_implied: PrepImplied;
  confidence: Confidence;
  evidence: string;
  surface_from: string | null;
  surface_until: string | null;
};

export const INTAKE_ITEM_JSON = `{
  "title": "short item title",
  "kind": "occurrence|obligation|hold|list_item|context_only",
  "occurs_at": "YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS or null",
  "due_at": "YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS or null",
  "actionable": "yes|no|maybe",
  "prep_implied": "none|stated|inferred",
  "confidence": "high|medium|low",
  "evidence": "short quote from the source, or empty string",
  "surface_from": "YYYY-MM-DD or null",
  "surface_until": "YYYY-MM-DD or null"
}`;

export function intakeContractRules(source: IntakeSource): string {
  const occursRule =
    source === 'calendar'
      ? `occurs_at: REQUIRED on the occurrence (the calendar event start). Child obligations must set occurs_at to null. Never copy a due date onto occurs_at.`
      : `occurs_at: null for obligations, holds, and list_items. Never use kind=occurrence for ${source}. A date that is an action deadline is due_at on an obligation — never occurs_at. Narrow exception: context_only MAY set occurs_at only when the source states an unambiguous calendar day as fact (e.g. "nursery is closed on the 19th", "19 September") AND confidence is high. Never for inferred, hedged, or estimated dates ("might", "sometime next week", "Tuesday-ish"). Code will strip occurs_at unless that bar is met.`;

  return `Intake contract — every item you return must fill these fields. ${INTAKE_ITEM_JSON}

kind:
- occurrence: something that genuinely happens, calendar events only.
- obligation: a concrete action (bring packed lunch, sign a form, buy a card).
- hold: awareness with no deadline ("trainers are getting small").
- list_item: a product or line on a shopping/custom list.
- context_only: useful context with no action and no calendar occurrence.

${occursRule}
due_at: when the action is due, if applicable. Any source may set this. Holds have due_at null. Do not invent a deadline.
actionable: yes if a real action exists; no if informational; maybe if uncertain.
prep_implied: none | stated | inferred. Map to storage as prep_origin.
confidence: high | medium | low.
evidence: a short quote or reference from the source text. Empty string if none.

Prep discipline — do NOT invent prep:
- Only create an obligation for prep that is explicitly stated, OR a well-established high-confidence type default (birthday → present and/or card, unless told otherwise).
- Actively check exclusions. If the source rules something out ("no presents please", "no gifts", "don't bring anything"), that specific prep must not be created, and prep_implied for it is none. Respect negatives; do not only look for positive signals.
- Low-confidence inferences must never become obligations. Example: "lunch with a friend" must NOT imply a gift. If you are not at least medium-confidence, omit the obligation entirely.
- When an occurrence or heads-up implies several obligations (birthday → card; school trip → packed lunch AND waterproof coat), return each as its own item. Do not bundle them into one record or a checklist blob.
- "Bring packed lunch and a waterproof coat" → exactly two high-confidence stated obligations, titles like "Packed lunch" and "Waterproof coat".
- "Taya's trainers are getting small" → one hold, due_at null, occurs_at null. Not an obligation with a fabricated deadline.
- "Nursery is closed on the 19th for staff training" → one context_only, high confidence, occurs_at = that day, no prep obligations.
- "Might need to pop in sometime next week" → hold or context_only with occurs_at null. Do not invent a calendar day.

Surface windows (you may set surface_from / surface_until as YYYY-MM-DD; code will fill defaults if null):
- birthday/party: about 7 days before until the day
- school forms / permission slips: based on the actual due date (about 14 days before until due)
- appointments: 1 day before or same-day
- holidays / passports: weeks to months before (about 60–90 days)`;
}

const KIT_TITLE_RE =
  /\b(packed lunch|waterproof|wellies|wellingtons|water bottle|named (towel|bottle)|towel|goggles|costume|swimsuit|swim suit|bobble|hair (band|tie)|socks|sun cream|sunhat|sun hat)\b/i;
const RSVP_ASK_RE =
  /\b(rsvp|reply so we know|please reply|let us know (if you can|numbers|if a grown-up|if you(?:'re| are) coming))\b/i;
const RSVP_TITLE_RE = /\b(rsvp|confirm (numbers|attendance)|reply)\b/i;
const DONATION_RE = /\b(donat(?:e|ion)|sanctuary|charity|in lieu)\b/i;
const GIFT_TITLE_RE = /\b(presents?|gifts?|goody\s*bags?)\b/i;
const CARD_TITLE_RE = /\b(cards?)\b/i;
const GIFT_EXCLUSION_RE = /\bno\s+(?:need\s+for\s+)?(?:presents?|gifts?)|please\s+no\s+(?:presents?|gifts?)|no\s+(?:presents?|gifts?)\s+please|don'?t\s+bring\s+(?:a\s+)?(?:present|gift)|without\s+(?:presents?|gifts?)/i;
const CARD_EXCLUSION_RE = /\bno\s+(?:need\s+for\s+)?cards?|please\s+no\s+cards?|no\s+cards?\s+please|don'?t\s+bring\s+(?:a\s+)?card/i;
const BIRTHDAY_RE = /\b(birthday|bday|party)\b/i;
const BIRTHDAY_DEFAULT_RE = /\bbirthdays?\b|\bbday\b/i;
const FORM_RE = /\b(form|permission|slip|ofsted|return by|due)\b/i;
const APPOINT_RE = /\b(appointment|dentist|doctor|gp|hospital|checkup|injection|vaccine|optician|hearing)\b/i;
const HOLIDAY_RE = /\b(holiday|passport|visa|flight|travel\s+insurance)\b/i;

export function parseIsoDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(trimmed);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== m - 1) return null;
  if (!match[4]) return `${match[1]}-${match[2]}-${match[3]}`;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? '00'}`;
}

export function dateOnly(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

const MONTH_NAME =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const ORDINAL_DAY = '\\d{1,2}(?:st|nd|rd|th)?';
const WEEKDAY = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

/** A specific calendar day named as fact — not "Friday" or "next week" alone. */
export function hasUnambiguousStatedDate(text: string): boolean {
  const t = text.replace(/\s+/g, ' ');
  if (new RegExp(`\\b(?:on|from|until|closed(?:\\s+on)?)\\s+(?:the\\s+)?${ORDINAL_DAY}\\b`, 'i').test(t)) return true;
  if (new RegExp(`\\b${ORDINAL_DAY}\\s+(?:of\\s+)?(?:${MONTH_NAME})\\b`, 'i').test(t)) return true;
  if (new RegExp(`\\b(?:${MONTH_NAME})\\s+${ORDINAL_DAY}\\b`, 'i').test(t)) return true;
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(t)) return true;
  return false;
}

/** Hedged / estimated timing — blocks the Schedule carve-out even if the model invented a day. */
export function hasSoftOrInferredDateLanguage(text: string): boolean {
  const t = text.replace(/\s+/g, ' ');
  if (/\b(sometime|some\s+time)\b/i.test(t)) return true;
  if (/\b\w+-ish\b/i.test(t)) return true;
  if (new RegExp(`\\blate\\s+(?:on\\s+)?(?:${WEEKDAY})\\b`, 'i').test(t)) return true;
  if (new RegExp(`\\b(?:might|maybe|perhaps|possibly)\\b.{0,48}\\b(?:next\\s+week|this\\s+week|pop\\s+in|be\\s+back|come\\s+by|come\\s+in)\\b`, 'i').test(t)) {
    return true;
  }
  if (new RegExp(`\\b(?:next\\s+week|this\\s+week|pop\\s+in|be\\s+back)\\b.{0,48}\\b(?:might|maybe|perhaps|possibly)\\b`, 'i').test(t)) {
    return true;
  }
  if (/\b(?:next|this)\s+week\b/i.test(t) && !hasUnambiguousStatedDate(t)) return true;
  return false;
}

/**
 * Email/chat may write occurs_at only for high-confidence context_only whose
 * source names a calendar day as fact. Obligations and inferred dates never qualify.
 */
export function informationalScheduleOccursAt(params: {
  kind: IntakeKind;
  confidence: Confidence;
  source: IntakeSource;
  sourceText: string;
  candidate: string | null;
}): string | null {
  if (params.source === 'calendar') return null;
  if (params.kind !== 'context_only') return null;
  if (params.confidence !== 'high') return null;
  const date = dateOnly(params.candidate);
  if (!date) return null;
  if (hasSoftOrInferredDateLanguage(params.sourceText)) return null;
  if (!hasUnambiguousStatedDate(params.sourceText)) return null;
  return date;
}

export function hasPersistableKind(items: IntakeItem[]): boolean {
  return items.some((item) => KINDS.includes(item.kind) && !!item.title);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function defaultSurfaceWindow(item: {
  title: string;
  kind: IntakeKind;
  occurs_at: string | null;
  due_at: string | null;
}): { surface_from: string | null; surface_until: string | null } {
  const anchor = dateOnly(item.occurs_at) || dateOnly(item.due_at);
  const title = item.title;

  if (item.kind === 'hold' || item.kind === 'list_item' || item.kind === 'context_only') {
    if (!anchor) return { surface_from: null, surface_until: null };
  }

  if (!anchor) return { surface_from: null, surface_until: null };

  if (BIRTHDAY_RE.test(title) || item.kind === 'occurrence' && BIRTHDAY_RE.test(title)) {
    return { surface_from: addDays(anchor, -7), surface_until: anchor };
  }
  if (HOLIDAY_RE.test(title)) {
    const days = /\bpassport\b/i.test(title) ? -90 : -60;
    return { surface_from: addDays(anchor, days), surface_until: anchor };
  }
  if (FORM_RE.test(title) || item.kind === 'obligation' && FORM_RE.test(title)) {
    return { surface_from: addDays(anchor, -14), surface_until: anchor };
  }
  if (APPOINT_RE.test(title)) {
    return { surface_from: addDays(anchor, -1), surface_until: anchor };
  }
  if (item.kind === 'obligation') {
    return { surface_from: addDays(anchor, -3), surface_until: anchor };
  }
  if (item.kind === 'occurrence') {
    if (BIRTHDAY_RE.test(title)) return { surface_from: addDays(anchor, -7), surface_until: anchor };
    return { surface_from: addDays(anchor, -1), surface_until: anchor };
  }
  return { surface_from: addDays(anchor, -3), surface_until: anchor };
}

function asKind(value: unknown, source: IntakeSource): IntakeKind | null {
  if (typeof value !== 'string') return null;
  const kind = value.trim().toLowerCase();
  if (!KINDS.includes(kind as IntakeKind)) return null;
  if (source !== 'calendar' && kind === 'occurrence') return 'context_only';
  return kind as IntakeKind;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase() as T;
  return allowed.includes(v) ? v : fallback;
}

function cleanTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  const title = value.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
  if (!title || title.toLowerCase() === 'null') return '';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function cleanEvidence(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.toLowerCase() === 'null') return '';
  return text.slice(0, 280);
}

export function sourceHasGiftExclusion(sourceText: string): boolean {
  return GIFT_EXCLUSION_RE.test(sourceText);
}

export function sourceHasCardExclusion(sourceText: string): boolean {
  return CARD_EXCLUSION_RE.test(sourceText);
}

export function isEventKitTitle(title?: string | null): boolean {
  return KIT_TITLE_RE.test(title || '');
}

export function sourceAsksForRsvp(sourceText: string): boolean {
  return RSVP_ASK_RE.test(sourceText);
}

export function isExcludedPrep(title: string, sourceText: string): boolean {
  if (GIFT_TITLE_RE.test(title) && sourceHasGiftExclusion(sourceText)) return true;
  if (CARD_TITLE_RE.test(title) && sourceHasCardExclusion(sourceText)) return true;
  return false;
}

export function titlesAlreadyCoverPrep(titles: string[], kind: 'gift' | 'card'): boolean {
  const re = kind === 'gift' ? GIFT_TITLE_RE : CARD_TITLE_RE;
  return titles.some((title) => re.test(title));
}

/** Drop low-confidence invented prep; keep stated items and high-confidence type defaults. */
export function shouldPersistObligation(item: IntakeItem): boolean {
  if (item.kind !== 'obligation') return true;
  if (item.confidence === 'low' && item.prep_implied === 'inferred') return false;
  if (item.confidence === 'low' && item.actionable !== 'yes') return false;
  return true;
}

export function normalizeIntakeItem(
  raw: RawIntakeItem,
  opts: { source: IntakeSource; sourceText: string; fallbackTitle?: string },
): IntakeItem | null {
  const title = cleanTitle(raw.title) || cleanTitle(opts.fallbackTitle);
  if (!title) return null;

  let kind = asKind(raw.kind, opts.source) ?? (opts.source === 'calendar' ? 'occurrence' : 'obligation');
  let occurs_at = opts.source === 'calendar' ? parseIsoDateTime(raw.occurs_at) : null;
  let due_at = parseIsoDateTime(raw.due_at);
  if (opts.source !== 'calendar' && !due_at) {
    due_at = parseIsoDateTime(raw.occurs_at);
  }

  if (kind === 'hold') due_at = null;
  if (kind === 'occurrence' && opts.source !== 'calendar') kind = due_at ? 'obligation' : 'context_only';

  const prep_implied = asEnum(
    raw.prep_implied ?? raw.prep_origin,
    PREP_IMPLIED,
    'none',
  );
  const confidence = asEnum(raw.confidence, CONFIDENCE, 'medium');
  const actionable = asEnum(raw.actionable, ACTIONABLE, kind === 'obligation' ? 'yes' : 'no');
  const evidence = cleanEvidence(raw.evidence);

  if (opts.source !== 'calendar') {
    occurs_at = informationalScheduleOccursAt({
      kind,
      confidence,
      source: opts.source,
      sourceText: opts.sourceText,
      candidate: parseIsoDateTime(raw.occurs_at) || due_at,
    });
  }

  if (isExcludedPrep(title, opts.sourceText)) return null;
  if (kind === 'obligation' && isEventKitTitle(title)) {
    due_at = null;
  }

  const item: IntakeItem = {
    title,
    kind,
    occurs_at,
    due_at,
    actionable,
    prep_implied,
    confidence,
    evidence,
    surface_from: parseIsoDateTime(raw.surface_from),
    surface_until: parseIsoDateTime(raw.surface_until),
  };

  if (!shouldPersistObligation(item)) return null;

  if (!item.surface_from || !item.surface_until) {
    const window = defaultSurfaceWindow(item);
    item.surface_from = item.surface_from ?? window.surface_from;
    item.surface_until = item.surface_until ?? window.surface_until;
  }

  return item;
}

export function normalizeIntakeItems(
  rawItems: unknown,
  opts: { source: IntakeSource; sourceText: string; fallbackTitle?: string },
): IntakeItem[] {
  const rows = Array.isArray(rawItems) ? rawItems : [];
  const out: IntakeItem[] = [];
  const seen = new Set<string>();
  for (const entry of rows) {
    if (!entry || typeof entry !== 'object') continue;
    const item = normalizeIntakeItem(entry as RawIntakeItem, opts);
    if (!item) continue;
    const key = `${item.kind}:${item.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function labelsToStatedObligations(
  labels: string[],
  opts: { due_at: string | null; sourceText: string; evidence?: string },
): IntakeItem[] {
  return normalizeIntakeItems(
    labels.map((title) => ({
      title,
      kind: 'obligation',
      occurs_at: null,
      due_at: opts.due_at,
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: opts.evidence || title,
    })),
    { source: 'email', sourceText: opts.sourceText },
  );
}

export function intakeRowFields(item: IntakeItem): Record<string, unknown> {
  return {
    kind: item.kind,
    occurs_at: item.occurs_at,
    due_at: item.due_at,
    confidence: item.confidence,
    prep_origin: item.prep_implied,
    evidence: item.evidence,
    surface_from: item.surface_from,
    surface_until: item.surface_until,
  };
}

export function eventDateFromIntake(item: IntakeItem, source: IntakeSource): string | null {
  if (source === 'calendar') return item.occurs_at;
  return item.occurs_at || item.due_at;
}

export function finalizeSourceItems(params: {
  source: 'email' | 'chat';
  sourceText: string;
  fallbackTitle?: string | null;
  date?: string | null;
  rawItems: unknown;
  extraLabels?: string[];
}): IntakeItem[] {
  let items = normalizeIntakeItems(params.rawItems, {
    source: params.source,
    sourceText: params.sourceText,
    fallbackTitle: params.fallbackTitle ?? undefined,
  });

  if (!items.length && params.fallbackTitle) {
    const statedFact =
      !!params.date &&
      hasUnambiguousStatedDate(params.sourceText) &&
      !hasSoftOrInferredDateLanguage(params.sourceText);
    const kind = params.extraLabels?.length
      ? 'context_only'
      : statedFact
        ? 'context_only'
        : 'hold';
    items = normalizeIntakeItems(
      [{
        title: params.fallbackTitle,
        kind,
        occurs_at: statedFact ? params.date ?? null : null,
        due_at: kind === 'hold' ? null : params.date ?? null,
        actionable: kind === 'obligation' ? 'yes' : 'no',
        prep_implied: 'none',
        confidence: statedFact ? 'high' : 'medium',
        evidence: '',
      }],
      { source: params.source, sourceText: params.sourceText },
    );
  }

  if (params.extraLabels?.length) {
    const extra = params.extraLabels.map((title) => ({
      title,
      kind: 'obligation',
      occurs_at: null,
      due_at: params.date ?? null,
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: title,
    }));
    items = [
      ...items,
      ...normalizeIntakeItems(extra, { source: params.source, sourceText: params.sourceText }),
    ];
  }

  const parent = items[0];
  const due = parent?.due_at ?? params.date ?? null;
  const defaults = birthdayTypeDefaults({
    sourceText: params.sourceText,
    existingTitles: items.map((item) => item.title),
    due_at: due,
  });
  const existingTitles = items.map((item) => item.title);
  for (const extra of defaults) {
    if (items.some((item) => item.title.toLowerCase() === extra.title.toLowerCase())) continue;
    if (GIFT_TITLE_RE.test(extra.title) && titlesAlreadyCoverPrep(existingTitles, 'gift')) continue;
    if (CARD_TITLE_RE.test(extra.title) && titlesAlreadyCoverPrep(existingTitles, 'card')) continue;
    items.push(extra);
  }

  items = applyPartyRsvp(items, params.sourceText, due);
  if (sourceHasGiftExclusion(params.sourceText)) {
    items = items.filter((item) => !DONATION_RE.test(item.title));
  }

  return items;
}

function applyPartyRsvp(items: IntakeItem[], sourceText: string, due: string | null): IntakeItem[] {
  if (!sourceAsksForRsvp(sourceText)) return items;
  if (items.some((item) => RSVP_TITLE_RE.test(item.title))) {
    return demotePartyObligation(items);
  }
  const rsvp = normalizeIntakeItem(
    {
      title: 'RSVP',
      kind: 'obligation',
      due_at: due,
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: 'reply',
    },
    { source: 'email', sourceText },
  );
  if (!rsvp) return items;
  return demotePartyObligation([...items, rsvp]);
}

function demotePartyObligation(items: IntakeItem[]): IntakeItem[] {
  if (!items.length) return items;
  const head = items[0];
  if (head.kind !== 'obligation') return items;
  if (!BIRTHDAY_RE.test(head.title)) return items;
  return [
    {
      ...head,
      kind: 'context_only',
      actionable: 'no',
    },
    ...items.slice(1),
  ];
}

export function splitParentAndChildren(
  items: IntakeItem[],
  fallbackTitle: string,
): { parent: IntakeItem; children: IntakeItem[] } {
  if (!items.length) {
    const parent: IntakeItem = {
      title: fallbackTitle,
      kind: 'hold',
      occurs_at: null,
      due_at: null,
      actionable: 'maybe',
      prep_implied: 'none',
      confidence: 'medium',
      evidence: '',
      surface_from: null,
      surface_until: null,
    };
    return { parent, children: [] };
  }

  const head = items[0];
  const rest = items.slice(1);
  const restObligations = rest.filter((item) => item.kind === 'obligation' || item.kind === 'list_item');
  const allObligations = items.filter((item) => item.kind === 'obligation');

  if (head.kind === 'obligation' && allObligations.length >= 2 && rest.every((item) => item.kind === 'obligation')) {
    const parent: IntakeItem = {
      title: fallbackTitle || head.title,
      kind: 'context_only',
      occurs_at: null,
      due_at: head.due_at,
      actionable: 'no',
      prep_implied: 'stated',
      confidence: head.confidence,
      evidence: head.evidence,
      surface_from: head.surface_from,
      surface_until: head.surface_until,
    };
    return { parent, children: allObligations };
  }

  if (head.kind === 'hold') {
    // Awareness stays one Radar card. Do not also emit "buy a new X" unless it has its own deadline.
    return {
      parent: head,
      children: restObligations.filter((item) => item.kind === 'obligation' && !!item.due_at),
    };
  }

  return { parent: head, children: restObligations.length ? restObligations : rest };
}

/** Birthday type-default: card/present only when not excluded and not already listed. */
export function birthdayTypeDefaults(params: {
  sourceText: string;
  existingTitles: string[];
  due_at: string | null;
}): IntakeItem[] {
  if (!BIRTHDAY_DEFAULT_RE.test(params.sourceText)) return [];
  const raw: RawIntakeItem[] = [];
  if (!sourceHasGiftExclusion(params.sourceText) && !titlesAlreadyCoverPrep(params.existingTitles, 'gift')) {
    raw.push({
      title: 'Present',
      kind: 'obligation',
      due_at: params.due_at,
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'high',
      evidence: '',
    });
  }
  if (!sourceHasCardExclusion(params.sourceText) && !titlesAlreadyCoverPrep(params.existingTitles, 'card')) {
    raw.push({
      title: 'Card',
      kind: 'obligation',
      due_at: params.due_at,
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'high',
      evidence: '',
    });
  }
  return normalizeIntakeItems(raw, { source: 'email', sourceText: params.sourceText });
}
