import {
  finalizeSourceItems,
  intakeContractRules,
  type IntakeItem,
} from './intake-contract.ts';
import { parseChecklistLabels } from './checklists.ts';
import { parseStandingFacts, type ProposedFact } from './family-facts.ts';
import { distinctSuggestion, optionalCopy } from './item-copy.ts';

function extraLabels(value: unknown): string[] {
  return parseChecklistLabels(value);
}

/** Single Haiku call: decide keep vs nothing_here and emit the full intake contract. */
export const EMAIL_INTAKE_PROMPT = `You are Taylo, a family assistant. Read this email once. Return ONLY a JSON object, nothing else:
{
  "capture": "keep|nothing_here",
  "category": "school|medical|activity|delivery|returns|financial|ignore",
  "action_required": true or false,
  "date": "YYYY-MM-DD or null — due_at for obligations; the calendar day for a named occurrence or stated-fact context_only",
  "who_it_affects": "you, a family member name, family, or null",
  "urgency": "today|this_week|upcoming|none",
  "nudge_title": "short title under 8 words, or null",
  "body": "one short subtitle under the title, maximum ~12 words, a single extra fact — or null",
  "detail": "one overview sentence for the expanded card — or null",
  "suggestion": "a distinct helpful next step, or null",
  "items": [ parent intake item first, then each separate obligation ],
  "standing_facts": []
}

capture is the persist gate. Decide it in this same response — there is no earlier classifier.
- nothing_here: marketing, promotions, social, generic newsletters, receipts/statements with nothing to do, tracking that is already fine. items must be [] and nudge_title/body null.
- keep: anything worth storing as occurrence, hold, context_only, obligation, or list_item. Undated awareness and stated facts with no action still count as keep.

Do NOT discard a family heads-up because nothing is due today. Examples that MUST be keep (never nothing_here):
- "Taya's trainers are getting small" / "shoes are too small" → hold, due_at null, occurs_at null.
- "Nursery closed on the 19th for staff training" → context_only, high confidence, occurs_at = that day, no invented prep.
- Birthday with "no presents please" → keep the party as occurrence (if the date is unambiguous); do not create a present obligation.
- "Bring packed lunch and a waterproof coat" → keep, two separate high-confidence stated obligations.
- "No authorisation on file — please contact Bupa" for an admission/operation → keep the happening as the parent (operation/admission), plus a child obligation to sort the authorisation. Do not title the parent as the auth problem.

Examples that MUST be nothing_here (never an occurrence, and never a reason to complete something already on Plan):
- "I can now confirm we have the required authorisation in place for the admission on the 23rd" → ignore. The parent ticks the auth item in the app.
- "RSVP received" / "we have received the form" / "payment is on file" with no new work.

action_required is true only when there is a real action (form, RSVP, payment, pack something stated). It is NOT the persist gate. Holds and context_only must still be returned with capture=keep and a valid kind when action_required is false.

If capture is keep, always fill items with a valid kind:
- items[0] is the parent heads-up. Use occurrence when they named a real event and an unambiguous day (wedding, birthday party, school trip). Use context_only for facts they do not attend (nursery closed).
- Further items are separate obligations (packed lunch, waterproof coat, plan the speech) — never collapse event + work into one obligation. Invent no prep.
- hold: undated awareness ("trainers are getting small"). due_at and occurs_at null.
- context_only: useful fact with no action. If the source states an unambiguous calendar day ("closed on the 19th"), set occurs_at to that day and confidence high. If the timing is hedged or vague ("sometime next week", "Tuesday-ish"), occurs_at must be null.
- nudge_title: the thing, short. A hard action ("Sign Arlo's trip form") or the event ("Nursery closed").
- body: one clipped extra fact (when, where, whose). No subordinate clauses. Not a second overview.
- detail: the one expanded-card sentence. A useful fact, not a recap of the subject line or of body.
- suggestion: only a genuine next step that is not already in detail or body (e.g. "I can draft the reply if you want it sent"). Null is valid and preferred over restating detail. Do not invent a to-do for holds or context_only.

Voice (this copy is shown on Home and Plan, not as an email summary):
- Calm, capable-friend register. Never alarmed. No exclamation marks. Never "don't forget", "you need to", "make sure", or "urgent".
- Don't use emoji. Address the parent as "you". Never write the parent's name in the third person.
- If the email is about a child, use the child's name.

Sound like this:
- "Sports day is Saturday. Kit is on the list if you want to pack tonight."
- "Arlo's birthday is Saturday. You might want to pick up a card."
- "The dentist is booked for the 19th. Tell me if you want help with what to take."

Not like this: "Don't forget Arlo's birthday!" / "You need to buy a birthday card!" / "This email is about sports day."

category is metadata only (school / medical / activity / delivery / returns / financial / ignore). It must not be used to drop a keep item. Prefer school/medical/activity for family life even when there is no action today.

standing_facts: durable family knowledge only — allergies, standing preferences ("no presents for birthdays"), who typically handles a category of admin. Not this email's one-off task. person is a household first name, or null for household-level. fact_type is person_attribute or household_pattern. Never invent. Empty array if none. Do not include behavioural patterns.`;

export type EmailCapture = 'keep' | 'nothing_here';

export type ExtractedNudge = {
  capture: EmailCapture;
  category: string;
  action_required: boolean;
  date: string | null;
  who_it_affects: string | null;
  urgency: string;
  nudge_title: string | null;
  body: string | null;
  detail: string | null;
  suggestion: string | null;
  items: IntakeItem[];
  standing_facts: ProposedFact[];
};

export function buildEmailIntakePrompt(params: {
  today: string;
  voiceBlock: string;
  factsBlock?: string;
}): string {
  const facts = params.factsBlock?.trim()
    ? `\n${params.factsBlock.trim()}\n`
    : '';
  return `${EMAIL_INTAKE_PROMPT}

${intakeContractRules('email')}${facts}

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
      date: typeof parsed.date === 'string' ? parsed.date : null,
      who_it_affects: parsed.who_it_affects ?? null,
      urgency: parsed.urgency || 'none',
      nudge_title: null,
      body: null,
      detail: null,
      suggestion: null,
      items: [],
      standing_facts: parseStandingFacts(parsed.standing_facts),
    };
  }
  return {
    capture,
    category: parsed.category,
    action_required: Boolean(parsed.action_required),
    date,
    who_it_affects: parsed.who_it_affects ?? null,
    urgency: parsed.urgency,
    nudge_title: parsed.nudge_title ?? null,
    body: optionalCopy(parsed.body ?? (parsed as { nudge_body?: unknown }).nudge_body, 160),
    detail: optionalCopy(parsed.detail ?? (parsed as { nudge_detail?: unknown }).nudge_detail),
    suggestion: distinctSuggestion(
      optionalCopy(parsed.suggestion),
      optionalCopy(parsed.detail ?? (parsed as { nudge_detail?: unknown }).nudge_detail),
      optionalCopy(parsed.body ?? (parsed as { nudge_body?: unknown }).nudge_body, 160),
      parsed.nudge_title ?? null,
    ),
    items: finalizeSourceItems({
      source: 'email',
      sourceText,
      fallbackTitle: parsed.nudge_title,
      date,
      rawItems: parsed.items,
      extraLabels: extraLabels(parsed.checklist_items),
    }),
    standing_facts: parseStandingFacts(parsed.standing_facts),
  };
}
