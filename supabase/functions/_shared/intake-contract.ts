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
      : `occurs_at: ALWAYS null. This source is ${source}, not a calendar event. A date in the text is due_at on an obligation — never occurs_at. Schedule only shows occurs_at, so setting it here would put email/chat on the calendar. This is a hard rule. Never use kind=occurrence for ${source}; use context_only (informational event), obligation (action due), hold (undated awareness), or list_item (shopping/list product).`;

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

Surface windows (you may set surface_from / surface_until as YYYY-MM-DD; code will fill defaults if null):
- birthday/party: about 7 days before until the day
- school forms / permission slips: based on the actual due date (about 14 days before until due)
- appointments: 1 day before or same-day
- holidays / passports: weeks to months before (about 60–90 days)`;
}

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

export function isExcludedPrep(title: string, sourceText: string): boolean {
  if (GIFT_TITLE_RE.test(title) && sourceHasGiftExclusion(sourceText)) return true;
  if (CARD_TITLE_RE.test(title) && sourceHasCardExclusion(sourceText)) return true;
  return false;
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
  if (opts.source !== 'calendar') occurs_at = null;

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

  if (isExcludedPrep(title, opts.sourceText)) return null;

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
  return item.due_at;
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
    const kind = params.extraLabels?.length
      ? 'context_only'
      : params.date
        ? 'obligation'
        : 'hold';
    items = normalizeIntakeItems(
      [{
        title: params.fallbackTitle,
        kind,
        occurs_at: null,
        due_at: params.date ?? null,
        actionable: kind === 'obligation' ? 'yes' : 'no',
        prep_implied: 'none',
        confidence: 'medium',
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
  for (const extra of defaults) {
    if (items.some((item) => item.title.toLowerCase() === extra.title.toLowerCase())) continue;
    items.push(extra);
  }

  return items.map((item) => ({ ...item, occurs_at: null }));
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

  if (head.kind === 'hold' && !rest.length) {
    return { parent: head, children: [] };
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
  const have = new Set(params.existingTitles.map((t) => t.toLowerCase()));
  const raw: RawIntakeItem[] = [];
  if (!sourceHasGiftExclusion(params.sourceText) && !have.has('present')) {
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
  if (!sourceHasCardExclusion(params.sourceText) && !have.has('card')) {
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
