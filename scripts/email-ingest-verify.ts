/**
 * Before/after Haiku measurement for merged email intake.
 * Needs ANTHROPIC_API_KEY in the environment.
 */
import { buildEmailIntakePrompt, parseEmailIntake } from '../supabase/functions/_shared/email-ingest.ts';
import { intakeContractRules, splitParentAndChildren } from '../supabase/functions/_shared/intake-contract.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5';

const OLD_CLASSIFY = `You are Taylo, a family assistant. Classify this email into exactly one of these categories and reply with only the category name, nothing else: school, medical, activity, delivery, returns, financial, ignore.

Category definitions:
- school: school, nursery, childcare, or a parent email about a child's school life (trips, sports day, forms, term dates, closures, staff training, inset)
- medical: appointments, prescriptions, NHS, GP, hospital, dental
- activity: sports clubs, after-school activities, classes, parties, playdates, community groups, clothes/shoes/kit a child is growing out of
- delivery: order confirmations, parcel tracking, courier notifications
- returns: return confirmations, refund notifications, exchange requests, return labels
- financial: bills, renewals, subscriptions, invoices, deadlines to pay
- ignore: marketing, promotions, social media, receipts with nothing to do, newsletters with no family relevance
Do NOT ignore a family heads-up just because nothing is due today. "Nursery closed on the 19th", "staff training day", "Taya's trainers are getting small" are school or activity — later stored as context_only or hold, not discarded.`;

const OLD_EXTRACT = `You are Taylo, a family assistant. Pull helpful relevance from this email — not a summary of the inbox. Return ONLY a JSON object, nothing else:
{
  "category": "school|medical|activity|delivery|returns|financial",
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

action_required is true only when there is a real action (form, RSVP, payment, pack something stated). It is NOT the persist gate. Holds and context_only must still be returned with a valid kind even when action_required is false.

If the email is noise (tracking that is fine, statements, generic newsletters), return empty items and a null title.

Otherwise always fill items with a valid kind:
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

Category guidance:
- school / medical / activity: prefer a heads-up over dropping the email, if you can name the event and the likely help. Skip only if there is no date, no prep, and no admin.
- delivery: action_required true only if someone needs to be home, or delivery failed
- returns: action_required true if a label needs printing, an item needs dropping off, or a deadline is approaching
- financial: action_required true if a payment, renewal, or deadline is actually coming — not a statement or receipt`;

const VOICE = `The person you are talking to is Sophie. Address them as "you" / "your". Never refer to Sophie in the third person.
When an email or nudge is about a child, use that child's name. Example: if it is about Taya, say "Taya's trip".
who_it_affects: "you" if it is the parent's own admin; the child's first name if it is about them.
This household: children: Taya. Only use these names when the item is actually about them. Do not invent extra children.`;

type Sample = { label: string; sender: string; subject: string; body: string; group: 'inbox' | 'fixture' };

const SAMPLES: Sample[] = [
  {
    group: 'inbox',
    label: 'Quick One (trainers)',
    sender: 'parent@example.com',
    subject: 'Quick One',
    body: "Just thinking Taya's trainers are looking really worn out — probably worth sorting soon.",
  },
  {
    group: 'inbox',
    label: 'staff training day',
    sender: 'nursery@example.com',
    subject: 'Reminder: staff training day',
    body: 'Just a note that nursery is closed for staff training on the 19th. No action needed from parents, just flagging it for your diaries.',
  },
  {
    group: 'inbox',
    label: "Libby's party",
    sender: 'friend@example.com',
    subject: "Libby's party this Saturday",
    body: "Hi! Just confirming Teddy's birthday party is this Saturday at 3pm at ours. No presents please — he's got way too many toys already! A card would be lovely if you're passing a shop, but honestly don't stress about it.",
  },
  {
    group: 'inbox',
    label: 'Year 2 farm trip',
    sender: 'school@example.com',
    subject: ' Year 2 trip to the farm – Tuesday 9 September',
    body: 'Just a reminder that Year 2 are going to Ashdown Farm on Tuesday 9 September. Please return the permission slip by Friday if you haven’t already. Children will need: a packed lunch (no nuts); a named water bottle; waterproof coat and wellies; a change of socks.',
  },
  {
    group: 'inbox',
    label: 'nursery invoice',
    sender: 'nursery@example.com',
    subject: 'Nursery invoice — payment due',
    body: "Just a reminder that this term's nursery invoice is due for payment by this Friday",
  },
  {
    group: 'inbox',
    label: 'junior tennis programme',
    sender: 'tennis@example.com',
    subject: 'Junior Autumn Tennis Programme 2026 - Starts Monday 7th September',
    body: 'Hi Dani, Sorry for the delay in getting the programme out. Please sign up before your first lesson.',
  },
  {
    group: 'inbox',
    label: "Oriel's bar mitzvah RSVP",
    sender: 'events@example.com',
    subject: "ORIEL'S BAR MITZVAH - RSVP BY MONDAY, 7 SEPTEMBER",
    body: "ORIEL'S BAR MITZVAH SHABBAT PARSHAT NOACH 17 OCTOBER 2026 - RSVP BY MONDAY, 7 SEPTEMBER",
  },
  {
    group: 'inbox',
    label: 'James research-paper chat',
    sender: 'james@example.com',
    subject: "Re: A conversation about a research paper for Alleyn’s Regent’s Park",
    body: 'All good. Chat at 2pm. James',
  },
  {
    group: 'inbox',
    label: 'dental book-now promo',
    sender: 'dental@example.com',
    subject: 'Fwd: Dani, Your Dental Appointment is Due – Book Now!',
    body: 'Dani, Your Dental Appointment is Due – Book Now!',
  },
  {
    group: 'inbox',
    label: 'NHM test email',
    sender: 'school@example.com',
    subject: 'Year 2 Trip to the Natural History Museum — Permission & Payment Required',
    body: 'This is a TEST email body that is not on the Today card. The coach leaves from the school gates at 8:05am. Packed lunch, no nuts. The test phrase is ZEBRA UMBRELLA.',
  },
  {
    group: 'inbox',
    label: 'September sunshine club (pre-filter miss)',
    sender: 'hello@sunshineclub.example',
    subject: 'Join the September sunshine club',
    body: 'This month in the club: exclusive member perks, our favourite reads, and 10% off your next shop. Tap to browse the edit.',
  },
  {
    group: 'fixture',
    label: "Taya's shoes are too small",
    sender: 'parent@example.com',
    subject: "Taya's shoes",
    body: "Taya's shoes are too small",
  },
  {
    group: 'fixture',
    label: 'staff-training closure',
    sender: 'nursery@example.com',
    subject: 'Reminder: staff training day',
    body: 'Nursery is closed on the 19th for staff training. No need to bring anything.',
  },
  {
    group: 'fixture',
    label: 'no-presents birthday',
    sender: 'friend@example.com',
    subject: "Libby's party this Saturday",
    body: "You're invited to Libby's birthday party this Saturday at 3pm. No presents please... he's got way too many toys already! A card would be lovely if you're passing a shop, but honestly don't stress about it.",
  },
  {
    group: 'fixture',
    label: 'packed lunch and coat',
    sender: 'school@example.com',
    subject: 'Year 2 farm trip',
    body: 'Year 2 farm trip on Friday. Please bring packed lunch and a waterproof coat.',
  },
];

function userMessage(sample: Sample): string {
  return `Sender: ${sample.sender}\nSubject: ${sample.subject}\nBody: ${sample.body}`;
}

type Usage = { input_tokens: number; output_tokens: number };

async function callClaude(
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ text: string; usage: Usage }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: Usage;
  };
  return {
    text: data.content?.find((block) => block.type === 'text')?.text ?? '',
    usage: {
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
    },
  };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    process.exitCode = 1;
    return;
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const newSystem = buildEmailIntakePrompt({ today, voiceBlock: VOICE });
  const oldExtractSystem = `${OLD_EXTRACT}

${intakeContractRules('email')}

Date rules:
- Today is ${today} (Europe/London).
- If the email gives a day and month with no year, use this year or the next occurrence — never last year just because the weekday matches.
- A school trip on "9 September" extracted in September ${today.slice(0, 4)} is ${today.slice(0, 4)}-09-09, not last year.
- Put action deadlines on due_at / the "date" field.
- occurs_at stays null except the context_only stated-fact exception in the intake contract.

Who you are talking to:
${VOICE}`;

  const inbox = SAMPLES.filter((sample) => sample.group === 'inbox');
  const fixtures = SAMPLES.filter((sample) => sample.group === 'fixture');

  let beforeCalls = 0;
  let afterCalls = 0;
  let beforeIn = 0;
  let beforeOut = 0;
  let afterIn = 0;
  let afterOut = 0;

  console.log('--- inbox sample (live Haiku, old 2-step vs merged 1-step) ---');
  for (const sample of inbox) {
    const user = userMessage(sample);
    const classify = await callClaude(apiKey, OLD_CLASSIFY, user, 32);
    beforeCalls += 1;
    beforeIn += classify.usage.input_tokens;
    beforeOut += classify.usage.output_tokens;
    const category = classify.text.trim().toLowerCase();
    let oldCalls = 1;
    if (category !== 'ignore') {
      const extracted = await callClaude(apiKey, oldExtractSystem, user, 2200);
      beforeCalls += 1;
      beforeIn += extracted.usage.input_tokens;
      beforeOut += extracted.usage.output_tokens;
      oldCalls = 2;
    }

    const merged = await callClaude(apiKey, newSystem, user, 2200);
    afterCalls += 1;
    afterIn += merged.usage.input_tokens;
    afterOut += merged.usage.output_tokens;
    const parsed = parseEmailIntake(merged.text, user);
    console.log(JSON.stringify({
      label: sample.label,
      oldCalls,
      oldCategory: category,
      newCapture: parsed.capture,
      newKinds: parsed.items.map((item) => `${item.kind}:${item.title}`),
      oldClassifyTokens: classify.usage,
      newTokens: merged.usage,
    }));
  }

  console.log('\nInbox totals', JSON.stringify({
    emails: inbox.length,
    beforeCalls,
    afterCalls,
    callsPerEmailBefore: +(beforeCalls / inbox.length).toFixed(2),
    callsPerEmailAfter: +(afterCalls / inbox.length).toFixed(2),
    beforeTokens: { in: beforeIn, out: beforeOut, total: beforeIn + beforeOut },
    afterTokens: { in: afterIn, out: afterOut, total: afterIn + afterOut },
  }));

  console.log('\n--- fixture cases (merged call) ---');
  for (const sample of fixtures) {
    const user = userMessage(sample);
    const merged = await callClaude(apiKey, newSystem, user, 2200);
    const parsed = parseEmailIntake(merged.text, user);
    const split = splitParentAndChildren(parsed.items, parsed.nudge_title || sample.subject);
    console.log(JSON.stringify({
      label: sample.label,
      capture: parsed.capture,
      parent: {
        kind: split.parent.kind,
        title: split.parent.title,
        occurs_at: split.parent.occurs_at,
        due_at: split.parent.due_at,
        confidence: split.parent.confidence,
        prep: split.parent.prep_implied,
      },
      children: split.children.map((item) => ({
        title: item.title,
        kind: item.kind,
        confidence: item.confidence,
        prep: item.prep_implied,
        occurs_at: item.occurs_at,
        due_at: item.due_at,
      })),
    }));
  }
}

await main();
