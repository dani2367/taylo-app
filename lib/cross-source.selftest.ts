import {
  planCrossSourceLink,
  scoreCrossSourceMatch,
  titleSimilarity,
  type LinkableItem,
} from '../supabase/functions/_shared/cross-source.ts';

function expect(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

const emailParty: LinkableItem = {
  id: 'email-1',
  title: "Frank's birthday party",
  kind: 'context_only',
  source: 'email',
  who_it_affects: 'Frank',
  occurs_at: '2026-10-12',
  due_at: null,
  event_date: '2026-10-12',
  parent_id: null,
  status: 'open',
  evidence: 'Frank’s birthday party on the 12th',
};

const calendarParty: LinkableItem = {
  id: 'cal-1',
  title: "Frank's party",
  kind: 'occurrence',
  source: 'calendar',
  who_it_affects: 'Frank',
  occurs_at: '2026-10-12T15:00:00',
  due_at: null,
  event_date: '2026-10-12T15:00:00',
  parent_id: null,
  status: 'open',
  evidence: '',
  body: 'The park',
};

const buyCard: LinkableItem = {
  id: 'child-1',
  title: 'Buy card',
  kind: 'obligation',
  source: 'email',
  parent_id: 'email-1',
  status: 'open',
};

expect(
  'fuzzy titles match birthday nicknames',
  titleSimilarity("Frank's birthday party", "Frank's bday") > 0.68,
  true,
);

const emailThenCalendar = planCrossSourceLink(calendarParty, [emailParty]);
expect('email first then calendar merges', emailThenCalendar.action, 'merge');
if (emailThenCalendar.action === 'merge') {
  expect('calendar is canonical when it arrives later', emailThenCalendar.canonicalId, 'cal-1');
  expect('email row is dismissed after calendar wins', emailThenCalendar.dismissId, 'email-1');
  expect('children repoint off the superseded email parent', emailThenCalendar.repointFromParentId, 'email-1');
  expect(
    'buy-card child follows the surviving occurrence',
    buyCard.parent_id === emailThenCalendar.repointFromParentId ? emailThenCalendar.canonicalId : buyCard.parent_id,
    'cal-1',
  );
}

const calendarThenEmail = planCrossSourceLink({ ...emailParty, id: undefined }, [calendarParty]);
expect('calendar first then email merges', calendarThenEmail.action, 'merge');
if (calendarThenEmail.action === 'merge') {
  expect('existing calendar stays canonical', calendarThenEmail.canonicalId, 'cal-1');
  expect('uninserted email is not dismissed as a row', calendarThenEmail.dismissId, null);
  expect('no parent_id repoint when email was never inserted', calendarThenEmail.repointFromParentId, null);
}

const swimming: LinkableItem = {
  id: 'email-swim',
  title: "Frank's swimming",
  kind: 'context_only',
  source: 'email',
  who_it_affects: 'Frank',
  occurs_at: '2026-10-12',
  parent_id: null,
  status: 'open',
};
const unrelated = planCrossSourceLink(calendarParty, [swimming]);
expect('coincidental same-name items do not merge', unrelated.action, 'create');

const dentist: LinkableItem = {
  id: 'cal-dentist',
  title: "Maya's dentist",
  kind: 'occurrence',
  source: 'calendar',
  who_it_affects: 'Maya',
  occurs_at: '2026-10-12',
  parent_id: null,
  status: 'open',
};
const assembly: LinkableItem = {
  id: 'email-assembly',
  title: "Maya's class assembly",
  kind: 'context_only',
  source: 'email',
  who_it_affects: 'Maya',
  occurs_at: '2026-10-12',
  parent_id: null,
  status: 'open',
};
expect('same person same day different events stay separate', planCrossSourceLink(dentist, [assembly]).action, 'create');

const medium = scoreCrossSourceMatch(
  { ...calendarParty, title: 'Team catch-up', who_it_affects: null },
  {
    id: 'email-catch',
    title: 'Catch up drinks',
    kind: 'context_only',
    source: 'email',
    who_it_affects: null,
    occurs_at: '2026-10-13',
    parent_id: null,
    status: 'open',
  },
);
expect('medium or weaker matches are not auto-merged', medium.confidence === 'high', false);

const nearbyBirthday = scoreCrossSourceMatch(
  { ...calendarParty, occurs_at: '2026-10-13', event_date: '2026-10-13' },
  emailParty,
);
expect('named life event one day apart can still be high', nearbyBirthday.confidence, 'high');

const firstOffload: LinkableItem = {
  id: 'chat-1',
  title: "Taya's operation",
  kind: 'occurrence',
  source: 'chat',
  who_it_affects: 'Taya',
  occurs_at: '2026-09-23T07:30:00',
  parent_id: null,
  status: 'open',
};
const secondOffload: LinkableItem = {
  title: "Taya's operation",
  kind: 'occurrence',
  source: 'chat',
  who_it_affects: 'Taya',
  occurs_at: '2026-09-23',
  parent_id: null,
  status: 'open',
};
const twoOffloads = planCrossSourceLink(secondOffload, [firstOffload]);
expect('two offloads of the same event merge', twoOffloads.action, 'merge');
if (twoOffloads.action === 'merge') {
  expect('first offload stays canonical', twoOffloads.canonicalId, 'chat-1');
  expect('second offload is not inserted', twoOffloads.dismissId, null);
}

const outlookCal: LinkableItem = {
  id: 'outlook-1',
  title: "Frank's party",
  kind: 'occurrence',
  source: 'calendar',
  who_it_affects: 'Frank',
  occurs_at: '2026-10-12',
  parent_id: null,
  status: 'open',
};
const appleCal: LinkableItem = {
  id: 'apple-1',
  title: "Frank's party",
  kind: 'occurrence',
  source: 'calendar',
  who_it_affects: 'Frank',
  occurs_at: '2026-10-12',
  parent_id: null,
  status: 'open',
};
expect('two calendar sources still do not auto-merge', planCrossSourceLink(appleCal, [outlookCal]).action, 'create');

const daniCal: LinkableItem = {
  ...outlookCal,
  id: 'dani-cal',
  created_by: 'dani',
  user_id: 'dani',
  household_id: 'hh-1',
};
const sophieCal: LinkableItem = {
  ...appleCal,
  id: 'sophie-cal',
  created_by: 'sophie',
  user_id: 'sophie',
  household_id: 'hh-1',
};
const partnerCals = planCrossSourceLink(sophieCal, [daniCal]);
expect('two partners calendar the same event merge', partnerCals.action, 'merge');
if (partnerCals.action === 'merge') {
  expect('existing partner calendar stays canonical', partnerCals.canonicalId, 'dani-cal');
  expect('incoming partner calendar is dismissed', partnerCals.dismissId, 'sophie-cal');
  expect('merged partner event is shared', partnerCals.patch.visibility, 'shared');
}

const sameOwnerApple: LinkableItem = { ...appleCal, id: 'apple-dani', created_by: 'dani', user_id: 'dani' };
const sameOwnerOutlook: LinkableItem = { ...outlookCal, id: 'outlook-dani', created_by: 'dani', user_id: 'dani' };
expect(
  'same person Apple and Outlook calendars stay separate',
  planCrossSourceLink(sameOwnerApple, [sameOwnerOutlook]).action,
  'create',
);

if (!process.exitCode) console.log('cross-source self-test passed');
