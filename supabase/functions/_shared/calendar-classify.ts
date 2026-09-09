import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { insertIntakeChildren } from './checklists.ts';
import { householdVoiceBlock, type Household } from './household.ts';
import {
  birthdayTypeDefaults,
  defaultSurfaceWindow,
  eventDateFromIntake,
  intakeContractRules,
  intakeRowFields,
  normalizeIntakeItem,
  normalizeIntakeItems,
  parseIsoDateTime,
  type IntakeItem,
} from './intake-contract.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5';
export const CALENDAR_CLASSIFY_BATCH = 20;
const CATEGORIES = ['school', 'medical', 'activity', 'home', 'errand', 'none'] as const;
const URGENCIES = ['today', 'this_week', 'upcoming', 'none'] as const;

export type CalendarIncoming = {
  id: string;
  title: string;
  location: string | null;
  start: string;
  all_day: boolean;
};

export type CalendarClassified = {
  id: string;
  action_implying: boolean;
  category: string | null;
  who_it_affects: string | null;
  urgency: string | null;
  action_description: string | null;
  occurrence: IntakeItem;
  obligations: IntakeItem[];
};

export function shouldClassifyExistingCalendarItem(opts: {
  classifiedAt: string | null | undefined;
  titleChanged: boolean;
  dateChanged: boolean;
}): boolean {
  return opts.titleChanged || opts.dateChanged || !opts.classifiedAt;
}

/** User close actions stay closed even if the calendar event still exists. */
export function syncedCalendarItemStatus(existingStatus: string | null | undefined): string {
  const value = (existingStatus || 'open').toLowerCase();
  if (value === 'done' || value === 'delegated' || value === 'dismissed') return value;
  return 'open';
}

export async function classifyCalendarEvents(
  apiKey: string,
  events: CalendarIncoming[],
  household: Household,
): Promise<CalendarClassified[]> {
  if (!events.length) return [];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const lines = events.map((event) => {
    const where = event.location?.trim() ? `location="${event.location.trim()}"` : 'location=none';
    const allDay = event.all_day ? 'all-day' : 'timed';
    return `- id=${event.id} | title="${event.title}" | start=${event.start} | ${allDay} | ${where}`;
  });

  const raw = await callClaude(apiKey, classifyPrompt(household, today), `Events:\n${lines.join('\n')}`);
  return parseClassified(raw, events);
}

export async function applyCalendarClassification(
  supabase: SupabaseClient,
  params: {
    userId: string;
    events: CalendarIncoming[];
    classified: CalendarClassified[];
  },
): Promise<number> {
  let children = 0;
  for (const row of params.classified) {
    const event = params.events.find((item) => item.id === row.id);
    if (!event) continue;

    const { error: updateError } = await supabase
      .from('items')
      .update({
        category: row.category,
        who_it_affects: row.who_it_affects,
        urgency_level: row.urgency,
        action_description: row.action_description,
        suggestion: row.action_description,
        classified_at: new Date().toISOString(),
        ...intakeRowFields(row.occurrence),
        event_date: eventDateFromIntake(row.occurrence, 'calendar') ?? event.start,
      })
      .eq('id', row.id)
      .eq('user_id', params.userId);
    if (updateError) {
      console.error('Failed to update classified calendar item:', updateError.message);
      continue;
    }

    if (!row.obligations.length) continue;
    const added = await insertIntakeChildren(supabase, {
      userId: params.userId,
      itemId: row.id,
      items: row.obligations,
    });
    children += added.length;
  }
  return children;
}

export async function classifyAndApplyCalendarItems(
  supabase: SupabaseClient,
  apiKey: string,
  userId: string,
  household: Household,
  items: CalendarIncoming[],
): Promise<{ classified: number; checklists: number }> {
  let classified = 0;
  let checklists = 0;
  for (let i = 0; i < items.length; i += CALENDAR_CLASSIFY_BATCH) {
    const batch = items.slice(i, i + CALENDAR_CLASSIFY_BATCH);
    const results = await classifyCalendarEvents(apiKey, batch, household);
    classified += results.length;
    for (const row of results) {
      const event = batch.find((item) => item.id === row.id);
      console.log(
        'Calendar classification:',
        event?.title ?? row.id,
        '-> actionable:',
        row.occurrence.actionable,
        'obligations:',
        row.obligations.length,
      );
    }
    checklists += await applyCalendarClassification(supabase, {
      userId,
      events: batch,
      classified: results,
    });
  }
  return { classified, checklists };
}

function classifyPrompt(household: Household, today: string): string {
  return `You are Taylo, a family assistant. Classify calendar events for a parent.

Today (Europe/London) is ${today}.

Your job is helpful relevance, not a full copy of the diary. Pick out family-life events and write a short heads-up: what is coming, and what they will likely need — only when prep is stated or a high-confidence type default.

Return ONLY a JSON object:
{
  "results": [
    {
      "id": "uuid from the input",
      "category": "school|medical|activity|home|errand|none",
      "who_it_affects": "family member name, family, or null",
      "urgency": "today|this_week|upcoming|none",
      "action_description": "a helpful heads-up in plain English, or null",
      "item": { intake fields for the occurrence },
      "obligations": [ intake items for each separate implied action, or [] ]
    }
  ]
}

${intakeContractRules('calendar')}

The parent row is always kind=occurrence. occurs_at must equal the event start from the input. obligations[].occurs_at must be null. If an obligation has a deadline, put it on due_at (often the event day).

action_description: required when actionable is yes or maybe, otherwise null. Write one or two short sentences like a friend putting it on their radar — not a nag and not a calendar echo.
- Name the event and when it is in human terms (this weekend, Tuesday, the 23rd).
- Mention prep only if stated or a high-confidence type default. Never invent kit/gifts for a vague lunch or a generic meeting.
- Interviews, 1:1s, standups, and generic work meetings: obligations must be []. Never invent "research the company", "prepare examples", or "review the job description".
- Offer help, don't instruct. Never "don't forget", "you need to", "make sure", or exclamation marks.

urgency: today if it is today; this_week if it falls in the next 7 days (including this weekend); upcoming if later; none when actionable is no.

Do not rewrite the event title. Only classify.

${householdVoiceBlock(household)}`;
}

export function parseClassified(raw: string, events: CalendarIncoming[]): CalendarClassified[] {
  const known = new Map(events.map((event) => [event.id, event]));
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: { results?: unknown } = {};
  try {
    parsed = JSON.parse(trimmed) as { results?: unknown };
  } catch {
    parsed = {};
  }
  const rows = Array.isArray(parsed.results) ? parsed.results : [];
  const out: CalendarClassified[] = [];
  const seen = new Set<string>();

  for (const entry of rows) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const event = known.get(id);
    if (!id || !event || seen.has(id)) continue;
    seen.add(id);
    out.push(classifiedFromRow(row, event));
  }

  for (const event of events) {
    if (seen.has(event.id)) continue;
    out.push(classifiedFromRow({}, event));
  }
  return out;
}

function classifiedFromRow(row: Record<string, unknown>, event: CalendarIncoming): CalendarClassified {
  const sourceText = `${event.title} ${event.location || ''}`;
  const occurs = parseIsoDateTime(event.start) || event.start;
  const rawItem = (row.item && typeof row.item === 'object' ? row.item : {}) as Record<string, unknown>;
  const occurrence = normalizeIntakeItem(
    {
      ...rawItem,
      title: typeof rawItem.title === 'string' ? rawItem.title : event.title,
      kind: 'occurrence',
      occurs_at: occurs,
      due_at: rawItem.due_at ?? null,
    },
    { source: 'calendar', sourceText, fallbackTitle: event.title },
  ) ?? fallbackOccurrence(event, occurs);

  if (!occurrence.occurs_at) occurrence.occurs_at = occurs;
  const window = defaultSurfaceWindow(occurrence);
  occurrence.surface_from = occurrence.surface_from ?? window.surface_from;
  occurrence.surface_until = occurrence.surface_until ?? window.surface_until;

  const obligations = mergeCalendarObligations(row, occurrence.occurs_at, sourceText);

  const categoryRaw = typeof row.category === 'string' ? row.category.toLowerCase() : 'none';
  const urgencyRaw = typeof row.urgency === 'string' ? row.urgency.toLowerCase() : 'none';
  const actionable = occurrence.actionable !== 'no' || obligations.length > 0;

  return {
    id: event.id,
    action_implying: actionable,
    category: CATEGORIES.includes(categoryRaw as (typeof CATEGORIES)[number]) && categoryRaw !== 'none'
      ? categoryRaw
      : null,
    who_it_affects: cleanText(row.who_it_affects),
    urgency: URGENCIES.includes(urgencyRaw as (typeof URGENCIES)[number])
      ? urgencyRaw
      : actionable
        ? 'upcoming'
        : 'none',
    action_description: actionable ? cleanText(row.action_description) : null,
    occurrence,
    obligations,
  };
}

function mergeCalendarObligations(
  row: Record<string, unknown>,
  dueAt: string | null,
  sourceText: string,
): IntakeItem[] {
  const fromModel = normalizeIntakeItems(row.obligations, {
    source: 'calendar',
    sourceText,
  }).map((item) => ({
    ...item,
    kind: 'obligation' as const,
    occurs_at: null,
    due_at: item.due_at ?? dueAt,
  }));

  const titles = fromModel.map((item) => item.title);
  const defaults = birthdayTypeDefaults({
    sourceText,
    existingTitles: titles,
    due_at: dueAt,
  }).map((item) => ({ ...item, occurs_at: null }));

  const merged = [...fromModel];
  for (const extra of defaults) {
    if (merged.some((item) => item.title.toLowerCase() === extra.title.toLowerCase())) continue;
    merged.push(extra);
  }
  return merged.map((item) => {
    const window = defaultSurfaceWindow(item);
    return {
      ...item,
      kind: 'obligation' as const,
      occurs_at: null,
      surface_from: item.surface_from ?? window.surface_from,
      surface_until: item.surface_until ?? window.surface_until,
    };
  });
}

function fallbackOccurrence(event: CalendarIncoming, occurs: string): IntakeItem {
  const item: IntakeItem = {
    title: event.title,
    kind: 'occurrence',
    occurs_at: occurs,
    due_at: null,
    actionable: 'no',
    prep_implied: 'none',
    confidence: 'high',
    evidence: '',
    surface_from: null,
    surface_until: null,
  };
  const window = defaultSurfaceWindow(item);
  return { ...item, ...window };
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.toLowerCase() === 'null') return null;
  return text.slice(0, 280);
}

async function callClaude(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  return data.content?.find((block) => block.type === 'text')?.text ?? '';
}
