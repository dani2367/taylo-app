import {
  defaultSurfaceWindow,
  finalizeSourceItems,
  intakeContractRules,
  isExcludedPrep,
  normalizeIntakeItem,
  shouldPersistObligation,
  splitParentAndChildren,
} from '../supabase/functions/_shared/intake-contract.ts';

function expect(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect(
  'email contract forbids occurs_at',
  intakeContractRules('email').includes('occurs_at: ALWAYS null'),
  true,
);
expect(
  'calendar contract requires occurs_at on occurrence',
  intakeContractRules('calendar').includes('occurs_at: REQUIRED on the occurrence'),
  true,
);

const noPresentsText =
  "You're invited to Maya's birthday party on 20 September. No presents please.";

const noPresents = finalizeSourceItems({
  source: 'email',
  sourceText: noPresentsText,
  fallbackTitle: "Maya's birthday",
  date: '2026-09-20',
  rawItems: [
    {
      title: "Maya's birthday",
      kind: 'occurrence',
      occurs_at: '2026-09-20',
      due_at: null,
      actionable: 'maybe',
      prep_implied: 'inferred',
      confidence: 'high',
      evidence: "Maya's birthday party",
    },
    {
      title: 'Present',
      kind: 'obligation',
      occurs_at: '2026-09-20',
      due_at: '2026-09-20',
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'high',
      evidence: 'birthday',
    },
    {
      title: 'Card',
      kind: 'obligation',
      occurs_at: null,
      due_at: '2026-09-20',
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'high',
      evidence: '',
    },
  ],
});

expect(
  'no-presents email never sets occurs_at',
  noPresents.every((item) => item.occurs_at === null),
  true,
);
expect(
  'no-presents email drops present even if the model invented it',
  noPresents.some((item) => /present/i.test(item.title)),
  false,
);
expect('exclusion helper catches present', isExcludedPrep('Present', noPresentsText), true);

const packedText =
  'Year 2 farm trip on Friday. Please bring packed lunch and a waterproof coat.';

const packed = finalizeSourceItems({
  source: 'email',
  sourceText: packedText,
  fallbackTitle: 'Year 2 farm trip',
  date: '2026-09-11',
  rawItems: [
    {
      title: 'Year 2 farm trip',
      kind: 'context_only',
      occurs_at: '2026-09-11',
      due_at: '2026-09-11',
      actionable: 'no',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: 'Year 2 farm trip on Friday',
    },
    {
      title: 'Packed lunch',
      kind: 'obligation',
      occurs_at: '2026-09-11',
      due_at: '2026-09-11',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: 'bring packed lunch',
    },
    {
      title: 'Waterproof coat',
      kind: 'obligation',
      occurs_at: null,
      due_at: '2026-09-11',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: 'waterproof coat',
    },
  ],
});

const packedSplit = splitParentAndChildren(packed, 'Year 2 farm trip');
expect('packed lunch parent is not an obligation blob', packedSplit.parent.kind, 'context_only');
expect(
  'packed lunch creates exactly two obligations',
  packedSplit.children.map((item) => item.title),
  ['Packed lunch', 'Waterproof coat'],
);
expect(
  'packed lunch obligations are high-confidence stated',
  packedSplit.children.every((item) => item.confidence === 'high' && item.prep_implied === 'stated'),
  true,
);
expect(
  'packed lunch dates are due_at not occurs_at',
  packedSplit.children.every((item) => item.due_at === '2026-09-11' && item.occurs_at === null),
  true,
);

const vagueGift = normalizeIntakeItem(
  {
    title: 'Gift',
    kind: 'obligation',
    due_at: '2026-09-12',
    actionable: 'maybe',
    prep_implied: 'inferred',
    confidence: 'low',
    evidence: '',
  },
  { source: 'email', sourceText: 'Lunch with a friend on Saturday' },
);
expect('low-confidence lunch gift is not persisted', vagueGift, null);
expect(
  'shouldPersistObligation rejects low inferred',
  shouldPersistObligation({
    title: 'Gift',
    kind: 'obligation',
    occurs_at: null,
    due_at: null,
    actionable: 'maybe',
    prep_implied: 'inferred',
    confidence: 'low',
    evidence: '',
    surface_from: null,
    surface_until: null,
  }),
  false,
);

const trainersText = "Taya's trainers are getting small";
const trainers = finalizeSourceItems({
  source: 'chat',
  sourceText: trainersText,
  fallbackTitle: "Taya's trainers",
  date: null,
  rawItems: [
    {
      title: "Taya's trainers getting small",
      kind: 'obligation',
      occurs_at: '2026-09-20',
      due_at: '2026-09-20',
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'medium',
      evidence: trainersText,
    },
  ],
});

// Model wrongly invented a deadline; chat hold fixture:
const trainersHold = finalizeSourceItems({
  source: 'chat',
  sourceText: trainersText,
  fallbackTitle: "Taya's trainers getting small",
  date: null,
  rawItems: [
    {
      title: "Taya's trainers getting small",
      kind: 'hold',
      occurs_at: '2026-09-20',
      due_at: '2026-09-20',
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: trainersText,
    },
  ],
});

expect('trainers hold has no due_at', trainersHold[0]?.due_at, null);
expect('trainers hold has no occurs_at', trainersHold[0]?.occurs_at, null);
expect('trainers kind is hold', trainersHold[0]?.kind, 'hold');
expect('trainers split has no child obligations', splitParentAndChildren(trainersHold, trainersText).children, []);

expect('email occurrence kind is coerced', trainers[0]?.kind !== 'occurrence', true);

const birthdayWindow = defaultSurfaceWindow({
  title: "Maya's birthday",
  kind: 'occurrence',
  occurs_at: '2026-09-20',
  due_at: null,
});
expect('birthday surfaces ~7 days before', birthdayWindow, {
  surface_from: '2026-09-13',
  surface_until: '2026-09-20',
});

const appointmentWindow = defaultSurfaceWindow({
  title: 'Dentist appointment',
  kind: 'occurrence',
  occurs_at: '2026-09-19',
  due_at: null,
});
expect('appointment surfaces 1 day before', appointmentWindow, {
  surface_from: '2026-09-18',
  surface_until: '2026-09-19',
});

const formWindow = defaultSurfaceWindow({
  title: 'Return permission slip',
  kind: 'obligation',
  occurs_at: null,
  due_at: '2026-09-25',
});
expect('school form surfaces from due date window', formWindow, {
  surface_from: '2026-09-11',
  surface_until: '2026-09-25',
});

const passportWindow = defaultSurfaceWindow({
  title: 'Renew passport',
  kind: 'obligation',
  occurs_at: null,
  due_at: '2026-12-01',
});
expect('passport surfaces months before', passportWindow, {
  surface_from: '2026-09-02',
  surface_until: '2026-12-01',
});

if (!process.exitCode) console.log('intake-contract self-test passed');
