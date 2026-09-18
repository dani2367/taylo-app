import {
  applyStandingFactsToIntake,
  confirmFact,
  dismissFact,
  emptyFactsStore,
  factsPromptBlock,
  inferredSourceStatus,
  insertInferredFact,
  insertManualFact,
  retrieveActiveFactsForPerson,
} from '../supabase/functions/_shared/family-facts.ts';
import { buildEmailIntakePrompt } from '../supabase/functions/_shared/email-ingest.ts';
import type { IntakeItem } from '../supabase/functions/_shared/intake-contract.ts';

function expect(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

const taya = { id: 'person_taya', first_name: 'Taya' };
const now = '2026-09-17T12:00:00.000Z';

const store = emptyFactsStore();
const manual = insertManualFact(
  store,
  { person_id: taya.id, fact_type: 'person_attribute', content: 'Allergic to peanuts' },
  { members: [taya], now, id: 'manual_1' },
);
expect('manual entry is active immediately', manual.status, 'active');
expect('manual entry skips review', manual.status === 'pending_review', false);
expect('manual source', manual.source, 'manual');
expect('inferred helper never auto-activates email', inferredSourceStatus('inferred_email'), 'pending_review');
expect('inferred helper never auto-activates chat', inferredSourceStatus('inferred_chat'), 'pending_review');
expect('user confirmation facts are active', inferredSourceStatus('user_confirmation'), 'active');

const emailStore = emptyFactsStore();
const inferred = insertInferredFact(
  emailStore,
  {
    person_id: taya.id,
    fact_type: 'person_attribute',
    content: 'Allergic to peanuts',
    source: 'inferred_email',
    confidence: 'high',
    evidence: 'Taya has a peanut allergy — please do not send nuts in lunchboxes',
  },
  { now, id: 'inferred_1' },
);
expect('email-inferred lands', inferred.ok, true);
if (inferred.ok) {
  expect('email-inferred is pending_review not active', inferred.fact.status, 'pending_review');
  expect('high confidence still pending', inferred.fact.confidence, 'high');
}

const reviewStore = emptyFactsStore();
insertInferredFact(
  reviewStore,
  {
    person_id: taya.id,
    fact_type: 'person_attribute',
    content: 'Needs gluten-free packed lunches',
    source: 'inferred_email',
  },
  { now, id: 'pending_gluten' },
);
expect(
  'pending fact is not queryable as active',
  retrieveActiveFactsForPerson(reviewStore.facts, { person_id: taya.id }).map((row) => row.content),
  [],
);
const confirmed = confirmFact(reviewStore, 'pending_gluten', { now: '2026-09-17T13:00:00.000Z' });
expect('confirm sets active', confirmed?.status, 'active');
expect('confirm sets last_confirmed', confirmed?.last_confirmed, '2026-09-17T13:00:00.000Z');
expect(
  'confirmed fact is queryable',
  retrieveActiveFactsForPerson(reviewStore.facts, { person_id: taya.id }).map((row) => row.content),
  ['Needs gluten-free packed lunches'],
);

const rejectStore = emptyFactsStore();
insertInferredFact(
  rejectStore,
  {
    person_id: taya.id,
    fact_type: 'person_attribute',
    content: 'Allergic to peanuts',
    source: 'inferred_email',
    evidence: 'peanut allergy noted on the form',
  },
  { now, id: 'reject_me' },
);
dismissFact(rejectStore, 'reject_me');
expect('dismiss sets rejected', rejectStore.facts[0]?.status, 'rejected');
const repropose = insertInferredFact(
  rejectStore,
  {
    person_id: taya.id,
    fact_type: 'person_attribute',
    content: 'Has a peanut allergy',
    source: 'inferred_email',
    evidence: 'Taya peanut allergy — do not send nuts',
  },
  { now, id: 'reject_again' },
);
expect('similar evidence is not re-proposed', repropose.ok, false);
if (!repropose.ok) expect('skip reason is rejected_similar', repropose.reason, 'rejected_similar');

const ingestStore = emptyFactsStore();
insertManualFact(
  ingestStore,
  { person_id: taya.id, fact_type: 'person_attribute', content: 'Allergic to peanuts' },
  { now, id: 'peanut_fact' },
);
insertManualFact(
  ingestStore,
  { person_id: null, fact_type: 'household_pattern', content: 'No presents for birthdays' },
  { now, id: 'no_gifts' },
);
const retrieved = retrieveActiveFactsForPerson(ingestStore.facts, { person_id: taya.id });
expect(
  'retrieval includes person attribute and household fact',
  retrieved.map((row) => row.id).sort(),
  ['no_gifts', 'peanut_fact'],
);
const prompt = buildEmailIntakePrompt({
  today: '2026-09-17',
  voiceBlock: 'The person you are talking to is Sophie.',
  factsBlock: factsPromptBlock(retrieved),
});
expect('ingest prompt includes peanut restriction', prompt.includes('Allergic to peanuts'), true);
expect('ingest prompt includes standing no-presents', prompt.includes('No presents for birthdays'), true);
expect('ingest prompt tells model to honor without restating', /honor these automatically/i.test(prompt), true);

const birthdayItems: IntakeItem[] = [
  {
    title: "Maya's birthday",
    kind: 'occurrence',
    occurs_at: '2026-10-02',
    due_at: null,
    actionable: 'maybe',
    prep_implied: 'none',
    confidence: 'high',
    evidence: 'birthday party',
    surface_from: null,
    surface_until: null,
  },
  {
    title: 'Present',
    kind: 'obligation',
    occurs_at: null,
    due_at: '2026-10-02',
    actionable: 'yes',
    prep_implied: 'inferred',
    confidence: 'high',
    evidence: 'birthday',
    surface_from: null,
    surface_until: null,
  },
  {
    title: 'RSVP',
    kind: 'obligation',
    occurs_at: null,
    due_at: '2026-09-20',
    actionable: 'yes',
    prep_implied: 'stated',
    confidence: 'high',
    evidence: 'reply so we know numbers',
    surface_from: null,
    surface_until: null,
  },
];
expect(
  'active no-presents fact drops gift prep without the email restating it',
  applyStandingFactsToIntake(birthdayItems, retrieved).map((item) => item.title),
  ["Maya's birthday", 'RSVP'],
);

const supersedeStore = emptyFactsStore();
insertManualFact(
  supersedeStore,
  { person_id: taya.id, fact_type: 'person_attribute', content: 'Can eat peanuts' },
  { now, id: 'old_peanut' },
);
insertManualFact(
  supersedeStore,
  { person_id: taya.id, fact_type: 'person_attribute', content: 'Allergic to peanuts' },
  { now: '2026-09-17T14:00:00.000Z', id: 'new_peanut' },
);
const old = supersedeStore.facts.find((row) => row.id === 'old_peanut');
const newer = supersedeStore.facts.find((row) => row.id === 'new_peanut');
expect('superseding fact stays active', newer?.status, 'active');
expect('old fact is superseded not duplicated as a second active row', old?.status, 'superseded');
expect('superseded_by points at the new fact', old?.superseded_by, 'new_peanut');
expect(
  'only the new restriction is queryable',
  retrieveActiveFactsForPerson(supersedeStore.facts, { person_id: taya.id }).map((row) => row.content),
  ['Allergic to peanuts'],
);

if (!process.exitCode) console.log('family-facts self-test passed');
