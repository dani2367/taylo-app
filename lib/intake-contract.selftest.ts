import {
  defaultSurfaceWindow,
  finalizeSourceItems,
  hasSoftOrInferredDateLanguage,
  hasUnambiguousStatedDate,
  intakeContractRules,
  isExcludedPrep,
  isAdminStatusConfirmation,
  isAdminStatusTitle,
  isIgnorableStatusUpdate,
  isAttendanceRestatement,
  isRedundantEventWork,
  isGenericDiaryTitle,
  isNamedDatedLifeEventCapture,
  namedPossessiveLifeEvent,
  parseStatedClock,
  parseUkCalendarDay,
  statedEventFromOffload,
  informationalScheduleOccursAt,
  isTransactionalConfirmation,
  normalizeIntakeItem,
  shouldPersistObligation,
  splitParentAndChildren,
  titleNamesAttendableEvent,
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
expect(
  'named event capture: stag',
  isNamedDatedLifeEventCapture("Oliver's stag", "oliver's stag is on the 23rd october"),
  true,
);
expect(
  'possessive event from offload sentence',
  namedPossessiveLifeEvent("oliver's stag is on the 23rd october - need to book flights asap"),
  "Oliver's stag",
);
expect(
  'parse 23rd october from today in September 2026',
  parseUkCalendarDay('on the 23rd october', new Date('2026-09-15T12:00:00Z')),
  '2026-10-23',
);

const stagText = "oliver's stag is on the 23rd october - need to book flights asap";
const stag = finalizeSourceItems({
  source: 'chat',
  sourceText: stagText,
  fallbackTitle: 'Book flights',
  date: '2026-10-23',
  rawItems: [
    {
      title: 'Book flights',
      kind: 'obligation',
      due_at: '2026-10-23',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: stagText,
    },
  ],
});
const stagSplit = splitParentAndChildren(stag, 'Book flights');
expect('stag offload parent is an occurrence', stagSplit.parent.kind, 'occurrence');
expect('stag offload title is the event', stagSplit.parent.title, "Oliver's stag");
expect('stag offload sits on 23 October', stagSplit.parent.occurs_at, '2026-10-23');
expect('stag offload parent is not list-bound work', stagSplit.parent.due_at, null);
expect(
  'stag offload keeps book flights as a child',
  stagSplit.children.map((item) => item.title),
  ['Book flights'],
);
expect(
  'spa day on a date is an event in the sentence',
  statedEventFromOffload('spa day on 12 June'),
  'Spa day',
);
expect(
  'parents evening is on a date is an event in the sentence',
  statedEventFromOffload("parents evening is on 4 November"),
  'Parents evening',
);
expect(
  'book eye test is not an event in the sentence',
  statedEventFromOffload('Book the eye test on 5 December'),
  null,
);

const spaText = 'spa day on 12 June';
const spa = finalizeSourceItems({
  source: 'chat',
  sourceText: spaText,
  fallbackTitle: 'Spa day',
  date: '2026-06-12',
  rawItems: [
    {
      title: 'Spa day',
      kind: 'obligation',
      due_at: '2026-06-12',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: spaText,
    },
  ],
});
expect('spa day offload is an occurrence', spa[0]?.kind, 'occurrence');
expect('spa day offload sits on 12 June', spa[0]?.occurs_at, '2026-06-12');

const wed = new Date('2026-09-16T12:00:00Z');
expect(
  'wednesday next week from a Wednesday is the following Wednesday',
  parseUkCalendarDay('tays operation on wednesday next week', wed),
  '2026-09-23',
);
expect(
  'next week on wednesday is the same day',
  parseUkCalendarDay('next week on wednesday', wed),
  '2026-09-23',
);
expect(
  'next wednesday from a Wednesday skips this week',
  parseUkCalendarDay('next wednesday', wed),
  '2026-09-23',
);
expect(
  'wednesday next week from a Monday is next week not this week',
  parseUkCalendarDay('on wednesday next week', new Date('2026-09-14T12:00:00Z')),
  '2026-09-23',
);
expect(
  'next wednesday from a Monday is this week',
  parseUkCalendarDay('next wednesday', new Date('2026-09-14T12:00:00Z')),
  '2026-09-16',
);
expect(
  'wednesday next week is a stated day',
  hasUnambiguousStatedDate('tays operation on wednesday next week'),
  true,
);
expect(
  'friday alone is not a stated day',
  hasUnambiguousStatedDate('Year 2 farm trip on Friday'),
  false,
);
expect(
  'this Friday from a Wednesday is that Friday',
  parseUkCalendarDay('would you join this Friday at 3pm', new Date(2026, 8, 16)),
  '2026-09-18',
);
expect(
  'tomorrow is the next calendar day',
  parseUkCalendarDay('meet online tomorrow at 10.30', new Date(2026, 8, 22)),
  '2026-09-23',
);
expect('uk numeric date is a stated day', parseUkCalendarDay('Delivery date: 24/09/2026'), '2026-09-24');
expect(
  'delivery date is a schedule day',
  informationalScheduleOccursAt({
    kind: 'context_only',
    confidence: 'high',
    source: 'email',
    sourceText: 'Delivery date: 24/09/2026',
    candidate: null,
  }),
  '2026-09-24',
);
expect(
  'the 29th uses the candidate day when no month is written',
  informationalScheduleOccursAt({
    kind: 'context_only',
    confidence: 'high',
    source: 'email',
    sourceText: 'The 29th is fine, as discussed. Marie can also be present.',
    candidate: '2026-09-29',
  }),
  '2026-09-29',
);
expect(
  'a clock with no day does not become a schedule date',
  informationalScheduleOccursAt({
    kind: 'context_only',
    confidence: 'high',
    source: 'email',
    sourceText: 'Just checking you are still OK to meet online at 10.30.',
    candidate: '2026-09-23',
  }),
  null,
);
expect(
  'next week alone is still soft',
  hasSoftOrInferredDateLanguage('tays operation next week'),
  true,
);
expect(
  'wednesday next week is not soft',
  hasSoftOrInferredDateLanguage('tays operation on wednesday next week'),
  false,
);
expect(
  'operation on wednesday next week is an event in the sentence',
  statedEventFromOffload("Tay's operation on wednesday next week"),
  "Tay's operation",
);

const opText = "Tay's operation on wednesday next week";
const op = finalizeSourceItems({
  source: 'chat',
  sourceText: opText,
  fallbackTitle: "Tay's operation",
  date: '2026-09-16',
  rawItems: [
    {
      title: "Tay's operation",
      kind: 'hold',
      due_at: '2026-09-16',
      actionable: 'maybe',
      prep_implied: 'none',
      confidence: 'medium',
      evidence: opText,
    },
  ],
});
expect('operation next-week-wednesday is an occurrence', op[0]?.kind, 'occurrence');
expect(
  'operation uses wednesday next week not the model guess',
  op[0]?.occurs_at,
  parseUkCalendarDay(opText),
);
expect('arrive at the hospital is just showing up', isAttendanceRestatement('Arrive at the hospital'), true);
expect('book flights is real extra work', isAttendanceRestatement('Book flights'), false);
expect('hospital admission authorised is a status title', isAdminStatusTitle('Hospital admission authorised'), true);
expect('bupa auth needed is not a status title', isAdminStatusTitle("Taya's admission — Bupa auth needed"), false);
expect('confirm bupa is not a status title', isAdminStatusTitle('Confirm Bupa authorisation'), false);
expect(
  'auth confirmation from the latest reply',
  isAdminStatusConfirmation(
    'Sender: hospital@nhs.uk\nSubject: Re: 23/09 admission\nBody: I can now confirm we have the required authorisation in place for the admission on the 23/09.\n\nFrom: Sophie\nSent: earlier\nThere is currently no authorisation in place.',
  ),
  true,
);
expect(
  'auth ask is not a confirmation even if it says in place',
  isAdminStatusConfirmation(
    'Sender: hospital@nhs.uk\nSubject: 23/09 admission\nBody: There is currently no authorisation in place. Please contact Bupa.',
  ),
  false,
);

const authAsk = finalizeSourceItems({
  source: 'email',
  sourceText:
    "Sender: hospital@nhs.uk\nSubject: 23/09 admission\nBody: Taya's admission is on 23/09. There is currently no authorisation in place. Please contact Bupa.",
  fallbackTitle: "Taya's admission — Bupa auth needed",
  date: '2026-09-23',
  rawItems: [
    {
      title: "Taya's admission — Bupa auth needed",
      kind: 'occurrence',
      occurs_at: '2026-09-23',
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: 'no authorisation in place',
    },
  ],
});
const authAskSplit = splitParentAndChildren(authAsk, "Taya's admission");
expect('auth-ask parent is the admission', authAskSplit.parent.title, "Taya's admission");
expect('auth-ask parent stays an occurrence', authAskSplit.parent.kind, 'occurrence');
expect(
  'auth-ask becomes a child obligation',
  authAskSplit.children.map((item) => item.title),
  ['Confirm Bupa authorisation'],
);

const authorised = finalizeSourceItems({
  source: 'email',
  sourceText:
    'Sender: hospital@nhs.uk\nSubject: Re: 23/09 admission\nBody: I can now confirm we have the required authorisation in place for the admission on the 23/09.',
  fallbackTitle: 'Hospital admission authorised',
  date: '2026-09-23',
  rawItems: [
    {
      title: 'Hospital admission authorised',
      kind: 'occurrence',
      occurs_at: '2026-09-23',
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: 'authorisation in place',
    },
  ],
});
expect('authorised confirmation is not persisted as an item', authorised, []);
expect(
  'authorised confirmation is ignored rather than treated as done',
  isIgnorableStatusUpdate({
    sourceText:
      'Sender: hospital@nhs.uk\nSubject: Re: 23/09 admission\nBody: I can now confirm we have the required authorisation in place for the admission on the 23/09.',
    title: 'Hospital admission authorised',
    items: [],
  }),
  true,
);
expect(
  'auth-needed mail is not ignored',
  isIgnorableStatusUpdate({
    sourceText:
      "Sender: hospital@nhs.uk\nSubject: 23/09 admission\nBody: There is currently no authorisation in place. Please contact Bupa.",
    title: "Taya's admission",
    items: [{ title: 'Confirm Bupa authorisation', kind: 'obligation' }],
  }),
  false,
);

const opArrive = finalizeSourceItems({
  source: 'chat',
  sourceText: opText,
  fallbackTitle: "Tay's operation",
  date: parseUkCalendarDay(opText),
  rawItems: [
    {
      title: "Tay's operation",
      kind: 'occurrence',
      occurs_at: parseUkCalendarDay(opText),
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: opText,
    },
    {
      title: 'Arrive at the hospital',
      kind: 'obligation',
      due_at: parseUkCalendarDay(opText),
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: 'arrive at the hospital',
    },
  ],
});
const opArriveSplit = splitParentAndChildren(opArrive, "Tay's operation");
expect('operation does not keep an arrive child', opArriveSplit.children.map((item) => item.title), []);
expect('operation parent stays the event', opArriveSplit.parent.kind, 'occurrence');

const timedOpText = "tayas operation is on wednesday next week - need to arrive by 7:30";
expect('arrive by 7:30 is showing up', isAttendanceRestatement('Need to arrive by 7:30'), true);
expect('arrive by 7:30 clock', parseStatedClock(timedOpText), '07:30');
expect(
  'form by the 19th is not a clock',
  parseStatedClock('Please return the trip form by the 19th.'),
  null,
);
expect(
  'timed operation is an event in the sentence',
  statedEventFromOffload(timedOpText),
  "Taya's operation",
);

const timedOp = finalizeSourceItems({
  source: 'chat',
  sourceText: timedOpText,
  fallbackTitle: "Taya's operation",
  date: '2026-09-16',
  extraLabels: ['Arrive by 7:30'],
  rawItems: [
    {
      title: "Taya's operation",
      kind: 'obligation',
      due_at: '2026-09-16',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: timedOpText,
    },
    {
      title: 'Need to arrive by 7:30',
      kind: 'obligation',
      due_at: '2026-09-16',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: 'need to arrive by 7:30',
    },
  ],
});
const timedSplit = splitParentAndChildren(timedOp, "Taya's operation");
expect('timed operation is an occurrence', timedSplit.parent.kind, 'occurrence');
expect(
  'timed operation sits on next Wednesday at 7:30',
  timedSplit.parent.occurs_at,
  `${parseUkCalendarDay(timedOpText)}T07:30:00`,
);
expect('timed operation has no arrive child', timedSplit.children.map((item) => item.title), []);

const nextWedText = "tayas operation is next Wednesday - need to arrive by 7:30am";
expect(
  'is next Wednesday names the event',
  statedEventFromOffload(nextWedText),
  "Taya's operation",
);
const nextWed = finalizeSourceItems({
  source: 'chat',
  sourceText: nextWedText,
  fallbackTitle: "Taya's operation",
  date: '2026-09-23',
  rawItems: [
    {
      title: "Taya's operation",
      kind: 'context_only',
      occurs_at: '2026-09-23',
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: 'operation is next Wednesday',
    },
  ],
});
expect('next-Wednesday operation is an occurrence', nextWed[0]?.kind, 'occurrence');
expect(
  'next-Wednesday operation keeps the day',
  String(nextWed[0]?.occurs_at || '').slice(0, 10),
  parseUkCalendarDay(nextWedText),
);
expect('next-Wednesday operation has the 7:30 clock', String(nextWed[0]?.occurs_at || '').includes('T07:30'), true);
expect('next-Wednesday operation has no children', nextWed.filter((item) => item.kind === 'obligation').length, 0);

const preOpText = "Taya's pre opp appointment for next Tuesday";
expect(
  'pre-op appointment for next Tuesday is an event in the sentence',
  statedEventFromOffload(preOpText),
  "Taya's pre opp appointment",
);
expect(
  'pre-op appointment is a named dated life event',
  isNamedDatedLifeEventCapture("Taya's pre-op appointment", preOpText),
  true,
);
expect(
  'book the appointment stays a chore',
  isNamedDatedLifeEventCapture('Book the appointment', 'Book the appointment on next Tuesday'),
  false,
);

const preOp = finalizeSourceItems({
  source: 'chat',
  sourceText: preOpText,
  fallbackTitle: "Taya's pre-op appointment",
  date: parseUkCalendarDay(preOpText),
  rawItems: [
    {
      title: "Taya's pre-op appointment for next Tuesday",
      kind: 'obligation',
      due_at: parseUkCalendarDay(preOpText),
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: preOpText,
    },
  ],
});
const preOpSplit = splitParentAndChildren(preOp, "Taya's pre-op appointment");
expect('pre-op offload is an occurrence', preOpSplit.parent.kind, 'occurrence');
expect(
  'pre-op offload keeps the Tuesday',
  String(preOpSplit.parent.occurs_at || '').slice(0, 10),
  parseUkCalendarDay(preOpText),
);
expect('pre-op offload has no attend child', preOpSplit.children.map((item) => item.title), []);
expect(
  'chat restatement of the calendar pre-op is redundant work',
  isRedundantEventWork('Tayas pre op appointment next Tuesday', 'Taya pre opp appointment'),
  true,
);
expect(
  'RSVP for the party is still work',
  isRedundantEventWork("RSVP for Taya's party", "Taya's party"),
  false,
);

expect('spa day is a named happening', titleNamesAttendableEvent('Spa day'), true);
expect('parents evening is a named happening', titleNamesAttendableEvent('Parents evening'), true);
expect('swimming lesson is a named happening', titleNamesAttendableEvent("Taya's swimming lesson"), true);
expect('haircut is a named happening', titleNamesAttendableEvent('Haircut'), true);
expect('standup is diary filler', isGenericDiaryTitle('Standup'), true);
expect('standup is not a named happening', titleNamesAttendableEvent('Standup'), false);
expect('weekly 1:1 is diary filler', isGenericDiaryTitle('Weekly 1:1'), true);
expect('book the eye test is still a chore', titleNamesAttendableEvent('Book the eye test'), false);
expect('nursery closed is context not an event they attend', titleNamesAttendableEvent('Nursery closed'), false);
expect(
  'spa day offload sentence is an event',
  isNamedDatedLifeEventCapture('Spa day', 'spa day on 12 June'),
  true,
);
expect(
  'parents evening offload sentence is an event',
  isNamedDatedLifeEventCapture('Parents evening', 'parents evening is on 4 November'),
  true,
);

const temuSource =
  "We've accepted the return request you submitted on Sep 23, 2026, 7:43 pm BST. Please print your return label. Your package needs to be dropped off within 14 days.";
expect(
  'Temu confirmation is transactional',
  isTransactionalConfirmation("We've accepted the return request you submitted", temuSource),
  true,
);
expect(
  'Temu confirmation is not a named happening',
  isNamedDatedLifeEventCapture("We've accepted the return request you submitted", temuSource),
  false,
);
expect('Temu confirmation is not an event in the sentence', statedEventFromOffload(temuSource), null);
const temu = finalizeSourceItems({
  source: 'email',
  sourceText: temuSource,
  fallbackTitle: "We've accepted the return request you submitted",
  date: '2026-09-23',
  rawItems: [
    {
      title: "We've accepted the return request you submitted",
      kind: 'occurrence',
      occurs_at: '2026-09-23T19:43:00',
      due_at: null,
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: 'accepted the return request you submitted on Sep 23, 2026, 7:43 pm BST',
    },
    {
      title: 'Print Temu return label',
      kind: 'obligation',
      occurs_at: null,
      due_at: '2026-09-23T19:43:00',
      actionable: 'yes',
      prep_implied: 'stated',
      confidence: 'high',
      evidence: 'Please print your return label',
    },
  ],
});
expect('Temu parent is an obligation', temu[0]?.kind, 'obligation');
expect('Temu parent has no occurs_at clock', temu[0]?.occurs_at, null);
expect(
  'Temu print-label due_at drops the confirmation clock',
  temu.find((item) => item.title === 'Print Temu return label')?.due_at,
  null,
);

const nurseryMeetSource =
  'Please come to a nursery meeting with speech and language on Tuesday 29 September at 10:30am.';
expect('nursery meeting at 10:30 is a clock', parseStatedClock(nurseryMeetSource), '10:30');
const nurseryMeet = finalizeSourceItems({
  source: 'email',
  sourceText: nurseryMeetSource,
  fallbackTitle: 'Nursery meeting with speech and language',
  date: '2026-09-29',
  rawItems: [
    {
      title: 'Nursery meeting with speech and language',
      kind: 'occurrence',
      occurs_at: '2026-09-29T10:30:00',
      due_at: null,
      actionable: 'no',
      prep_implied: 'none',
      confidence: 'high',
      evidence: 'meeting on Tuesday 29 September at 10:30am',
    },
  ],
});
expect('nursery meeting stays an occurrence', nurseryMeet[0]?.kind, 'occurrence');
expect('nursery meeting keeps 10:30', nurseryMeet[0]?.occurs_at, '2026-09-29T10:30:00');

if (!process.exitCode) console.log('intake-contract self-test passed');
