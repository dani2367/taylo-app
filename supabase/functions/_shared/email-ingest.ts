import {
  finalizeSourceItems,
  intakeContractRules,
  type IntakeItem,
} from './intake-contract.ts';
import { parseChecklistLabels } from './checklists.ts';

function extraLabels(value: unknown): string[] {
  return parseChecklistLabels(value);
}

/** Single Haiku call: decide keep vs nothing_here and emit the full intake contract. */
export const EMAIL_INTAKE_PROMPT = `You are Taylo, a family assistant. Read this email once. Return ONLY a JSON object, nothing else:
{
  "capture": "keep|nothing_here",
  "category": "school|medical|activity|delivery|returns|financial|ignore",
  "action_required": true or false,
  "action_description": "a helpful heads-up in plain English, or null",
  "date": "YYYY-MM-DD or null — due_at for obligations; for a stated-fact context_only this is the calendar day",
  "who_it_affects": "which family member or whole family",
  "urgency": "today|this_week|upcoming|none",
  "nudge_title": "short title under 8 words, or null",
  "nudge_body": "one short subtitle under the title, maximum ~12 words, a single extra fact — or null",
  "nudge_detail": "1-2 conversational sentences for the expanded card — or null",
  "suggestion": "the helpful next step or radar line, no label — or null",
  "items": [ parent intake item first, then each separate obligation ]
}

capture is the persist gate. Decide it in this same response — there is no earlier classifier.
- nothing_here: marketing, promotions, social, generic newsletters, receipts/statements with nothing to do, tracking that is already fine. items must be [] and nudge_title/nudge_body null.
- keep: anything worth storing as hold, context_only, obligation, or list_item. Undated awareness and stated facts with no action still count as keep.

Do NOT discard a family heads-up because nothing is due today. Examples that MUST be keep (never nothing_here):
- "Taya's trainers are getting small" / "shoes are too small" → hold, due_at null, occurs_at null.
- "Nursery closed on the 19th for staff training" → context_only, high confidence, occurs_at = that day, no invented prep.
- Birthday with "no presents please" → keep the party as context_only; do not create a present obligation.
- "Bring packed lunch and a waterproof coat" → keep, two separate high-confidence stated obligations.

action_required is true only when there is a real action (form, RSVP, payment, pack something stated). It is NOT the persist gate. Holds and context_only must still be returned with capture=keep and a valid kind when action_required is false.

If capture is keep, always fill items with a valid kind:
- items[0] is the parent heads-up (kind is never occurrence).
- Further items are separate obligations (packed lunch, waterproof coat) — never a checklist blob. Invent no prep.
- hold: undated awareness ("trainers are getting small"). due_at and occurs_at null.
- context_only: useful fact with no action. If the source states an unambiguous calendar day ("closed on the 19th"), set occurs_at to that day and confidence high. If the timing is hedged or vague ("sometime next week", "Tuesday-ish"), occurs_at must be null.
- nudge_title: the thing, short. A hard action ("Sign Arlo's trip form") or the event ("Nursery closed").
- nudge_body: one clipped extra fact (when, where, whose). No subordinate clauses.
- suggestion and action_description: for holds/context, a calm note is enough — not an invented to-do.
- nudge_detail: the same helpful voice when the card expands — not a recap of the subject line.

Voice (this copy is shown on Home and Plan, not as an email summary):
- Calm, capable-friend register. Never alarmed. No exclamation marks. Never "don't forget", "you need to", "make sure", or "urgent".
- Don't use emoji. Address the parent as "you". Never write the parent's name in the third person.
- If the email is about a child, use the child's name.

Sound like this:
- "Sports day is Saturday. Kit is on the list if you want to pack tonight."
- "Arlo's birthday is Saturday. You might want to pick up a card."
- "The dentist is booked for the 19th. Tell me if you want help with what to take."

Not like this: "Don't forget Arlo's birthday!" / "You need to buy a birthday card!" / "This email is about sports day."

category is metadata only (school / medical / activity / delivery / returns / financial / ignore). It must not be used to drop a keep item. Prefer school/medical/activity for family life even when there is no action today.`;

export type EmailCapture = 'keep' | 'nothing_here';

export type ExtractedNudge = {
  capture: EmailCapture;
  category: string;
  action_required: boolean;
  action_description: string | null;
  date: string | null;
  who_it_affects: string | null;
  urgency: string;
  nudge_title: string | null;
  nudge_body: string | null;
  nudge_detail: string | null;
  suggestion: string | null;
  items: IntakeItem[];
};

export function buildEmailIntakePrompt(params: { today: string; voiceBlock: string }): string {
  return `${EMAIL_INTAKE_PROMPT}

${intakeContractRules('email')}

Date rules:
- Today is ${params.today} (Europe/London).
- If the email gives a day and month with no year, use this year or the next occurrence — never last year just because the weekday matches.
- A school trip on "9 September" extracted in September ${params.today.slice(0, 4)} is ${params.today.slice(0, 4)}-09-09, not last year.
- Put action deadlines on due_at / the "date" field.
- occurs_at stays null except the context_only stated-fact exception in the intake contract.

Who you are talking to:
${params.voiceBlock}`;
}

export function parseEmailCapture(value: unknown): EmailCapture {
  if (value === false || value === 'false') return 'nothing_here';
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase().replace(/\s+/g, '_');
    if (
      v === 'nothing_here' ||
      v === 'nothing' ||
      v === 'none' ||
      v === 'ignore' ||
      v === 'drop' ||
      v === 'discard'
    ) {
      return 'nothing_here';
    }
    if (v === 'keep' || v === 'intake' || v === 'capture') return 'keep';
  }
  // Missing capture defaults to keep so a family heads-up is never dropped by metadata.
  return 'keep';
}

export function parseEmailIntake(raw: string, sourceText: string): ExtractedNudge {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(trimmed) as ExtractedNudge & {
    date?: string | null;
    items?: unknown;
    checklist_items?: unknown;
    capture?: unknown;
  };
  const capture = parseEmailCapture(parsed.capture);
  const date = typeof parsed.date === 'string' ? parsed.date : null;
  if (capture === 'nothing_here') {
    return {
      capture,
      category: parsed.category || 'ignore',
      action_required: false,
      action_description: null,
      date: null,
      who_it_affects: parsed.who_it_affects ?? null,
      urgency: parsed.urgency || 'none',
      nudge_title: null,
      nudge_body: null,
      nudge_detail: null,
      suggestion: null,
      items: [],
    };
  }
  return {
    capture,
    category: parsed.category,
    action_required: Boolean(parsed.action_required),
    action_description: parsed.action_description ?? null,
    date,
    who_it_affects: parsed.who_it_affects ?? null,
    urgency: parsed.urgency,
    nudge_title: parsed.nudge_title ?? null,
    nudge_body: parsed.nudge_body ?? null,
    nudge_detail: parsed.nudge_detail ?? null,
    suggestion: parsed.suggestion ?? null,
    items: finalizeSourceItems({
      source: 'email',
      sourceText,
      fallbackTitle: parsed.nudge_title,
      date,
      rawItems: parsed.items,
      extraLabels: extraLabels(parsed.checklist_items),
    }),
  };
}
