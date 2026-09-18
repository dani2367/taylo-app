import {
  buildEmailIntakePrompt,
  parseEmailCapture,
  parseEmailIntake,
} from '../supabase/functions/_shared/email-ingest.ts';
import { splitParentAndChildren } from '../supabase/functions/_shared/intake-contract.ts';

function expect(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

const prompt = buildEmailIntakePrompt({
  today: '2026-09-08',
  voiceBlock: 'The person you are talking to is Sophie.',
});

expect('merged prompt has no separate coarse classifier instruction', prompt.includes('reply with only the category name'), false);
expect('merged prompt names nothing_here', prompt.includes('nothing_here'), true);
expect('merged prompt keeps hold trainers example', /trainers are getting small/i.test(prompt), true);
expect('merged prompt keeps staff-training context_only', /staff training/i.test(prompt), true);
expect('merged prompt keeps packed-lunch split', /Packed lunch/.test(prompt), true);
expect('merged prompt keeps no-presents discipline', /no presents please/i.test(prompt), true);
expect('merged prompt still includes Phase 3 prep discipline', prompt.includes('do NOT invent prep'), true);
expect('prompt asks for one overview detail', /"detail":/.test(prompt), true);
expect('prompt does not ask for nudge_detail', prompt.includes('nudge_detail'), false);
expect('prompt does not ask for action_description', prompt.includes('action_description'), false);
expect('prompt prefers null suggestion over restating', /Null is valid and preferred/.test(prompt), true);

expect('explicit nothing_here wins', parseEmailCapture('nothing_here'), 'nothing_here');
expect('missing capture defaults to keep', parseEmailCapture(undefined), 'keep');
expect('ignore alias is nothing_here', parseEmailCapture('ignore'), 'nothing_here');

const discarded = parseEmailIntake(
  JSON.stringify({
    capture: 'nothing_here',
    category: 'ignore',
    action_required: false,
    nudge_title: 'Weekly deals',
    items: [{ title: 'Weekly deals', kind: 'hold', confidence: 'low' }],
  }),
  'Sender: hello@shop.example\nSubject: Your September picks\nBody: 20% off toys this week only.',
);
expect('nothing_here strips invented items', discarded.items, []);
expect('nothing_here strips title', discarded.nudge_title, null);
expect('nothing_here capture', discarded.capture, 'nothing_here');

const trainersSource =
  "Sender: jane@example.com\nSubject: Quick One\nBody: Taya's shoes are too small — trainers are getting tight.";
const trainers = parseEmailIntake(
  JSON.stringify({
    capture: 'keep',
    category: 'activity',
    action_required: false,
    nudge_title: "Taya's trainers are getting small",
    items: [
      {
        title: "Taya's trainers are getting small",
        kind: 'hold',
        occurs_at: '2026-09-20',
        due_at: '2026-09-20',
        actionable: 'no',
        prep_implied: 'none',
        confidence: 'high',
        evidence: "shoes are too small",
      },
    ],
  }),
  trainersSource,
);
expect('trainers stay a hold', trainers.items[0]?.kind, 'hold');
expect('trainers due_at stripped', trainers.items[0]?.due_at, null);
expect('trainers occurs_at stripped', trainers.items[0]?.occurs_at, null);

const nurserySource =
  'Sender: nursery@example.com\nSubject: Reminder: staff training day\nBody: Nursery is closed on the 19th for staff training. No need to bring anything.';
const nursery = parseEmailIntake(
  JSON.stringify({
    capture: 'keep',
    category: 'school',
    action_required: false,
    date: '2026-09-19',
    nudge_title: 'Nursery closed',
    items: [
      {
        title: 'Nursery closed',
        kind: 'context_only',
        occurs_at: '2026-09-19',
        due_at: null,
        actionable: 'no',
        prep_implied: 'none',
        confidence: 'high',
        evidence: 'closed on the 19th for staff training',
      },
      {
        title: 'Packed lunch',
        kind: 'obligation',
        due_at: '2026-09-19',
        actionable: 'yes',
        prep_implied: 'inferred',
        confidence: 'low',
        evidence: '',
      },
    ],
  }),
  nurserySource,
);
expect('staff training is context_only', nursery.items[0]?.kind, 'context_only');
expect('staff training schedule carve-out keeps occurs_at', nursery.items[0]?.occurs_at, '2026-09-19');
expect(
  'staff training invents no prep',
  nursery.items.filter((item) => item.kind === 'obligation'),
  [],
);

const partySource =
  "Sender: sam@example.com\nSubject: Libby's party this Saturday\nBody: You're invited to Libby's birthday party this Saturday at 3pm. No presents please... he's got way too many toys already! A card would be lovely if you're passing a shop, but honestly don't stress about it.";
const party = parseEmailIntake(
  JSON.stringify({
    capture: 'keep',
    category: 'activity',
    action_required: false,
    date: '2026-09-12',
    nudge_title: "Libby's birthday party",
    items: [
      {
        title: "Libby's birthday party",
        kind: 'context_only',
        occurs_at: null,
        due_at: '2026-09-12',
        actionable: 'no',
        prep_implied: 'none',
        confidence: 'high',
        evidence: "Libby's birthday party this Saturday",
      },
      {
        title: 'Present',
        kind: 'obligation',
        due_at: '2026-09-12',
        actionable: 'yes',
        prep_implied: 'inferred',
        confidence: 'high',
        evidence: 'birthday',
      },
      {
        title: 'Birthday card for Libby',
        kind: 'obligation',
        due_at: '2026-09-12',
        actionable: 'maybe',
        prep_implied: 'inferred',
        confidence: 'medium',
        evidence: 'A card would be lovely',
      },
    ],
  }),
  partySource,
);
expect('no-presents drops present obligation', party.items.some((item) => /present/i.test(item.title)), false);
expect('no-presents keeps a card option', party.items.some((item) => /card/i.test(item.title)), true);

const packedSource =
  'Sender: school@example.com\nSubject: Year 2 farm trip\nBody: Year 2 farm trip on Friday. Please bring packed lunch and a waterproof coat.';
const packed = parseEmailIntake(
  JSON.stringify({
    capture: 'keep',
    category: 'school',
    action_required: true,
    date: '2026-09-11',
    nudge_title: 'Year 2 farm trip',
    items: [
      {
        title: 'Year 2 farm trip',
        kind: 'context_only',
        due_at: '2026-09-11',
        actionable: 'no',
        prep_implied: 'stated',
        confidence: 'high',
        evidence: 'Year 2 farm trip on Friday',
      },
      {
        title: 'Packed lunch',
        kind: 'obligation',
        due_at: '2026-09-11',
        actionable: 'yes',
        prep_implied: 'stated',
        confidence: 'high',
        evidence: 'bring packed lunch',
      },
      {
        title: 'Waterproof coat',
        kind: 'obligation',
        due_at: '2026-09-11',
        actionable: 'yes',
        prep_implied: 'stated',
        confidence: 'high',
        evidence: 'waterproof coat',
      },
    ],
  }),
  packedSource,
);
const packedSplit = splitParentAndChildren(packed.items, 'Year 2 farm trip');
expect('packed lunch splits to two obligations', packedSplit.children.map((item) => item.title), [
  'Packed lunch',
  'Waterproof coat',
]);
expect(
  'packed lunch obligations high-confidence stated',
  packedSplit.children.every((item) => item.confidence === 'high' && item.prep_implied === 'stated'),
  true,
);

const copy = parseEmailIntake(
  JSON.stringify({
    capture: 'keep',
    category: 'school',
    action_required: true,
    nudge_title: 'Farm trip form',
    body: 'Due Friday',
    detail: 'Return the permission slip by Friday.',
    suggestion: 'Return the permission slip by Friday.',
    items: [{ title: 'Farm trip form', kind: 'obligation', due_at: '2026-09-11', actionable: 'yes', confidence: 'high' }],
  }),
  packedSource,
);
expect('duplicate suggestion is dropped', copy.suggestion, null);
expect('detail is kept', copy.detail, 'Return the permission slip by Friday.');
expect('legacy nudge_body still maps', parseEmailIntake(
  JSON.stringify({
    capture: 'keep',
    category: 'school',
    nudge_title: 'INSET',
    nudge_body: 'Nursery closed Friday',
    nudge_detail: 'Staff training day — no need to pack lunch.',
    suggestion: null,
    items: [{ title: 'INSET', kind: 'context_only', occurs_at: '2026-09-19', actionable: 'no', confidence: 'high' }],
  }),
  nurserySource,
).body, 'Nursery closed Friday');

if (!process.exitCode) console.log('email-ingest self-test passed');
