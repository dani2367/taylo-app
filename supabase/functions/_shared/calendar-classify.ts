import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  CHECKLIST_PROMPT_RULE,
  insertPrepChecklist,
  parseChecklistLabels,
} from './checklists.ts';
import { householdVoiceBlock, type Household } from './household.ts';

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
  checklist_items: string[];
};

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
  let checklists = 0;
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
      })
      .eq('id', row.id)
      .eq('user_id', params.userId);
    if (updateError) {
      console.error('Failed to update classified calendar item:', updateError.message);
      continue;
    }

    if (!row.action_implying || !row.checklist_items.length) continue;
    await insertPrepChecklist(supabase, {
      userId: params.userId,
      itemId: row.id,
      itemTitle: event.title,
      labels: row.checklist_items,
    });
    checklists += 1;
  }
  return checklists;
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
        '-> action_implying:',
        row.action_implying,
        'checklist:',
        row.checklist_items.length,
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

Return ONLY a JSON object:
{
  "results": [
    {
      "id": "uuid from the input",
      "action_implying": true or false,
      "category": "school|medical|activity|home|errand|none",
      "who_it_affects": "family member name, family, or null",
      "urgency": "today|this_week|upcoming|none",
      "action_description": "the follow-up action in plain English, or null",
      "checklist_items": ["Present", "Card"] or null
    }
  ]
}

action_implying is true if the event plausibly implies a follow-up: birthdays, anniversaries, trips, holidays, parties, sports days, deadlines, or appointments that clearly need prep. It is also true for named meetings about something specific in family life — a child's VF or visit, an interview, a school meeting, a named appointment — even when there is nothing to pack. It is false for purely informational blocks: standup, untitled 1:1s, generic "meeting", focus time, commute, regular lessons, drop-off/pick-up.

If action_implying is false, checklist_items and action_description must be null.
If action_implying is true because the event needs prep, put 2–5 concrete labels in checklist_items.
If action_implying is true because it is a named/topic meeting with no packing list, checklist_items must be null and action_description must be a short, calm offer of help — like a friend, not a nag. Example: "Taya's VF is on the 23rd. Tell me if you need anything for it." Never "don't forget", "you need to", or exclamation marks.
Do not rewrite the event title. Only classify.

${CHECKLIST_PROMPT_RULE}

${householdVoiceBlock(household)}`;
}

function parseClassified(raw: string, events: CalendarIncoming[]): CalendarClassified[] {
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
    if (!id || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    const action = Boolean(row.action_implying);
    const categoryRaw = typeof row.category === 'string' ? row.category.toLowerCase() : 'none';
    const urgencyRaw = typeof row.urgency === 'string' ? row.urgency.toLowerCase() : 'none';
    out.push({
      id,
      action_implying: action,
      category: CATEGORIES.includes(categoryRaw as (typeof CATEGORIES)[number]) && categoryRaw !== 'none'
        ? categoryRaw
        : null,
      who_it_affects: cleanText(row.who_it_affects),
      urgency: URGENCIES.includes(urgencyRaw as (typeof URGENCIES)[number]) ? urgencyRaw : 'none',
      action_description: action ? cleanText(row.action_description) : null,
      checklist_items: action ? parseChecklistLabels(row.checklist_items) : [],
    });
  }

  for (const event of events) {
    if (seen.has(event.id)) continue;
    out.push({
      id: event.id,
      action_implying: false,
      category: null,
      who_it_affects: null,
      urgency: 'none',
      action_description: null,
      checklist_items: [],
    });
  }
  return out;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.toLowerCase() === 'null') return null;
  return text.slice(0, 240);
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
      max_tokens: 1600,
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
