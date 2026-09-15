import {
  defaultSurfaceWindow,
  finalizeSourceItems,
  hasSoftOrInferredDateLanguage,
  hasUnambiguousStatedDate,
  intakeContractRules,
  isExcludedPrep,
  isNamedDatedLifeEventCapture,
  informationalScheduleOccursAt,
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
  'email contract allows named-event occurrence',
  intakeContractRules('email').includes('kind=occurrence IS allowed'),
  true,
);
expect(
  'email contract names the stated-fact exception',
  intakeContractRules('email').includes('context_only MAY set occurs_at'),
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
  'no-presents obligations never set occurs_at',
  noPresents.filter((item) => item.kind === 'obligation').every((item) => item.occurs_at === null),
  true,
);
expect(
  'stated-fact birthday occurrence may sit on schedule',
  noPresents.find((item) => item.kind === 'occurrence')?.occurs_at,
  '2026-09-20',
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
  'packed lunch kit is not given a form deadline',
  packedSplit.children.every((item) => item.due_at === null && item.occurs_at === null),
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

expect('email occurrence kind is not used for undated holds', trainers[0]?.kind !== 'occurrence', true);

const nurseryText = 'Nursery is closed on the 19th for staff training. No need to bring anything.';
const nurseryClosed = finalizeSourceItems({
  source: 'email',
  sourceText: nurseryText,
  fallbackTitle: 'Nursery closed',
  date: '2026-09-19',
  rawItems: [
    {
      title: 'Nursery closed',
      kind: 'context_only',
      occurs_at: '2026-09-19',
      due_at: null,
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: 'Nursery is closed on the 19th',
    },
    {
      title: 'Packed lunch',
      kind: 'obligation',
      occurs_at: '2026-09-19',
      due_at: '2026-09-19',
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'low',
      evidence: '',
    },
  ],
});
expect('nursery closure is context_only', nurseryClosed[0]?.kind, 'context_only');
expect('nursery closure occurs_at is the stated day', nurseryClosed[0]?.occurs_at, '2026-09-19');
expect(
  'nursery closure invents no prep',
  nurseryClosed.filter((item) => item.kind === 'obligation'),
  [],
);

const vaguePopIn = finalizeSourceItems({
  source: 'email',
  sourceText: 'Might need to pop in sometime next week',
  fallbackTitle: 'Pop in',
  date: '2026-09-15',
  rawItems: [
    {
      title: 'Pop in',
      kind: 'context_only',
      occurs_at: '2026-09-15',
      due_at: '2026-09-15',
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: 'sometime next week',
    },
  ],
});
expect('vague next-week email never gets occurs_at', vaguePopIn[0]?.occurs_at, null);

const lateIsh = informationalScheduleOccursAt({
  kind: 'context_only',
  confidence: 'high',
  source: 'email',
  sourceText: 'might be back late Tuesday-ish',
  candidate: '2026-09-15',
});
expect('Tuesday-ish is not a stated fact', lateIsh, null);
expect('on the 19th is a stated fact', hasUnambiguousStatedDate(nurseryText), true);
expect('sometime next week is soft', hasSoftOrInferredDateLanguage('Might need to pop in sometime next week'), true);

const mediumClosure = normalizeIntakeItem(
  {
    title: 'Nursery closed',
    kind: 'context_only',
    occurs_at: '2026-09-19',
    confidence: 'medium',
    actionable: 'no',
    prep_implied: 'none',
    evidence: 'closed on the 19th',
  },
  { source: 'email', sourceText: nurseryText },
);
expect('medium-confidence stated date stays off schedule', mediumClosure?.occurs_at, null);

const formDue = normalizeIntakeItem(
  {
    title: 'Return the trip form',
    kind: 'obligation',
    due_at: '2026-09-19',
    confidence: 'high',
    actionable: 'yes',
    prep_implied: 'stated',
    evidence: 'return by the 19th',
  },
  { source: 'email', sourceText: 'Please return the trip form by the 19th.' },
);
expect('obligation with a firm date still has no occurs_at', formDue?.occurs_at, null);

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

const softCardText =
  "Teddy's birthday party is this Saturday. No presents please. A card would be lovely if you're passing a shop, but honestly don't stress about it.";
const softCard = finalizeSourceItems({
  source: 'email',
  sourceText: softCardText,
  fallbackTitle: "Teddy's birthday party",
  date: '2026-09-12',
  rawItems: [
    {
      title: "Teddy's birthday party",
      kind: 'context_only',
      due_at: '2026-09-12',
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: "Teddy's birthday party is this Saturday",
    },
    {
      title: 'Birthday card for Teddy',
      kind: 'obligation',
      due_at: '2026-09-12',
      actionable: 'maybe',
      prep_implied: 'inferred',
      confidence: 'medium',
      evidence: 'A card would be lovely if you\'re passing a shop',
    },
  ],
});
expect(
  'soft card keeps the model row only',
  softCard.filter((item) => /\bcard/i.test(item.title)).map((item) => item.title),
  ['Birthday card for Teddy'],
);
expect(
  'soft card does not add a default Card',
  softCard.some((item) => item.title.toLowerCase() === 'card'),
  false,
);

const birthdayNoPrep = finalizeSourceItems({
  source: 'email',
  sourceText: "You're invited to Maya's birthday on 20 September.",
  fallbackTitle: "Maya's birthday",
  date: '2026-09-20',
  rawItems: [
    {
      title: "Maya's birthday",
      kind: 'context_only',
      due_at: '2026-09-20',
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: "Maya's birthday",
    },
  ],
});
expect(
  'birthday with no prep still gets type-default card and present',
  birthdayNoPrep.filter((item) => item.kind === 'obligation').map((item) => item.title).sort(),
  ['Card', 'Present'],
);
expect('birthday with a stated day is an occurrence', birthdayNoPrep[0]?.kind, 'occurrence');

const helmet = splitParentAndChildren(
  [
    {
      title: "Taya's bike helmet cracked",
      kind: 'hold',
      occurs_at: null,
      due_at: null,
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: 'helmet is cracked',
      surface_from: null,
      surface_until: null,
    },
    {
      title: 'Buy new bike helmet for Taya',
      kind: 'obligation',
      occurs_at: null,
      due_at: null,
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'high',
      evidence: 'need a new one',
      surface_from: null,
      surface_until: null,
    },
  ],
  "Taya's bike helmet cracked",
);
expect('helmet stay a single hold', helmet.parent.kind, 'hold');
expect('helmet does not also create a buy-child', helmet.children.length, 0);

const kitDue = normalizeIntakeItem(
  {
    title: 'Goggles',
    kind: 'obligation',
    due_at: '2026-09-11',
    actionable: 'yes',
    prep_implied: 'stated',
    confidence: 'high',
  },
  { source: 'email', sourceText: 'She needs goggles for the gala on Thursday.' },
);
expect('kit due date is not treated as a deadline', kitDue?.due_at, null);

const marleyText =
  "Marley's party is Sunday 14th, 11am-1pm at the soft play. Please no gifts — he's asked for donations to the hedgehog sanctuary instead. Reply so we know numbers.";
const marley = finalizeSourceItems({
  source: 'email',
  sourceText: marleyText,
  fallbackTitle: "Marley's 6th birthday party",
  date: '2026-09-14',
  rawItems: [
    {
      title: "Marley's 6th birthday party",
      kind: 'obligation',
      due_at: '2026-09-14',
      actionable: 'yes',
      prep_implied: 'none',
      confidence: 'high',
      evidence: "Marley's party is Sunday",
    },
    {
      title: 'Hedgehog sanctuary donation',
      kind: 'list_item',
      due_at: '2026-09-14',
      actionable: 'yes',
      prep_implied: 'inferred',
      confidence: 'medium',
      evidence: 'donations to the hedgehog sanctuary',
    },
  ],
});
expect('marley party is an occurrence not a home to-do', marley[0]?.kind, 'occurrence');
expect('marley keeps an RSVP', marley.some((item) => item.kind === 'obligation' && /rsvp/i.test(item.title)), true);
expect(
  'marley does not keep a donation leftover',
  marley.some((item) => /donat|sanctuary/i.test(item.title)),
  false,
);
expect('marley does not invent a present', marley.some((item) => item.title.toLowerCase() === 'present'), false);

const weddingText =
  "Olivier's wedding is on 5 December. I need to plan the chairman speech.";
const wedding = finalizeSourceItems({
  source: 'chat',
  sourceText: weddingText,
  fallbackTitle: "Olivier's wedding",
  date: '2026-12-05',
  rawItems: [
    {
      title: "Olivier's wedding — chairman speech",
      kind: 'obligation',
      occurs_at: null,
      due_at: '2026-12-05',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: weddingText,
    },
  ],
});
const weddingSplit = splitParentAndChildren(wedding, "Olivier's wedding");
expect('collapsed wedding becomes an occurrence', weddingSplit.parent.kind, 'occurrence');
expect('collapsed wedding occurs_at is the stated day', weddingSplit.parent.occurs_at, '2026-12-05');
expect('collapsed wedding parent has no due_at', weddingSplit.parent.due_at, null);
expect('collapsed wedding speech is a child obligation', weddingSplit.children.map((item) => item.title), [
  'Chairman speech',
]);
expect('collapsed wedding speech due_at is the event day', weddingSplit.children[0]?.due_at, '2026-12-05');
expect('collapsed wedding speech has no occurs_at', weddingSplit.children[0]?.occurs_at, null);

const writeForText = 'olivers wedding on 5th december - need to write my chairman speech';
const writeFor = finalizeSourceItems({
  source: 'chat',
  sourceText: writeForText,
  fallbackTitle: "Write chairman speech for Oliver's wedding",
  date: '2026-12-05',
  extraLabels: ["Write chairman speech for Oliver's wedding"],
  rawItems: [
    {
      title: "Write chairman speech for Oliver's wedding",
      kind: 'obligation',
      occurs_at: null,
      due_at: '2026-12-05',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: writeForText,
    },
  ],
});
const writeForSplit = splitParentAndChildren(writeFor, "Write chairman speech for Oliver's wedding");
expect('write-for wedding is an occurrence', writeForSplit.parent.kind, 'occurrence');
expect('write-for wedding title is the event', writeForSplit.parent.title, "Oliver's wedding");
expect('write-for wedding sits on the stated day', writeForSplit.parent.occurs_at, '2026-12-05');
expect(
  'write-for speech is the radar obligation',
  writeForSplit.children.map((item) => item.title),
  ['Write chairman speech'],
);

const eyeText = 'Book the eye test on 5 December';
const eyeTest = finalizeSourceItems({
  source: 'chat',
  sourceText: eyeText,
  fallbackTitle: "Book Taya's eye test",
  date: '2026-12-05',
  rawItems: [
    {
      title: "Book Taya's eye test",
      kind: 'obligation',
      due_at: '2026-12-05',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: eyeText,
    },
  ],
});
expect('dated eye test stays an obligation', eyeTest[0]?.kind, 'obligation');
expect('dated eye test is not an occurrence', eyeTest.some((item) => item.kind === 'occurrence'), false);

const teacherText = 'Email the teacher about the farm trip on 5 December';
const teacher = finalizeSourceItems({
  source: 'chat',
  sourceText: teacherText,
  fallbackTitle: 'Email the teacher about the farm trip',
  date: '2026-12-05',
  rawItems: [
    {
      title: 'Email the teacher about the farm trip',
      kind: 'obligation',
      due_at: '2026-12-05',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: teacherText,
    },
  ],
});
expect('email about a trip stays an obligation', teacher[0]?.kind, 'obligation');
expect('email about a trip is not an occurrence', teacher.some((item) => item.kind === 'occurrence'), false);

const shoesText = "Buy Arlo's shoes for the wedding on 5 December";
const shoes = finalizeSourceItems({
  source: 'chat',
  sourceText: shoesText,
  fallbackTitle: "Buy Arlo's shoes for the wedding",
  date: '2026-12-05',
  rawItems: [
    {
      title: "Buy Arlo's shoes for the wedding",
      kind: 'obligation',
      due_at: '2026-12-05',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: shoesText,
    },
  ],
});
expect('shoes for the wedding stay an obligation', shoes[0]?.kind, 'obligation');
expect(
  'named event capture: wedding',
  isNamedDatedLifeEventCapture("Oliver's wedding", "Oliver's wedding on 5 December"),
  true,
);
expect(
  'named event capture: collapsed speech',
  isNamedDatedLifeEventCapture("Write chairman speech for Oliver's wedding", writeForText),
  true,
);
expect(
  'named event capture: not eye test',
  isNamedDatedLifeEventCapture("Book Taya's eye test", eyeText),
  false,
);
expect(
  'named event capture: not email about trip',
  isNamedDatedLifeEventCapture('Email the teacher about the farm trip', teacherText),
  false,
);
expect(
  'named event capture: not shoes for wedding',
  isNamedDatedLifeEventCapture("Buy Arlo's shoes for the wedding", shoesText),
  false,
);

if (!process.exitCode) console.log('intake-contract self-test passed');
