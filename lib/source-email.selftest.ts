import {
  canReadSourceEmail,
  emailBodyParagraphs,
  orderSourceEmails,
  originalEmailVisible,
  sourceEmailLookupId,
  splitEmailChain,
} from './source-email';

function expect(name: string, got: unknown, want: unknown) {
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect('parent lookup is itself', sourceEmailLookupId({ id: 'parent', parent_id: null }), 'parent');
expect(
  'checklist child follows parent',
  sourceEmailLookupId({ id: 'child', parent_id: 'parent' }),
  'parent',
);
expect(
  'merged calendar item looks up itself',
  sourceEmailLookupId({ id: 'cal', parent_id: null }),
  'cal',
);

for (const kind of ['obligation', 'occurrence', 'hold', 'list_item', 'context_only']) {
  expect(`email ${kind} shows`, originalEmailVisible('email', 0), true);
  expect(`chat ${kind} hidden`, originalEmailVisible('chat', 3), false);
  expect(`manual ${kind} hidden`, originalEmailVisible('manual', 1), false);
  expect(`action library ${kind} hidden`, originalEmailVisible('action_library', 1), false);
  expect(`calendar ${kind} hidden without a mail`, originalEmailVisible('calendar', 0), false);
  expect(`calendar ${kind} shows once a mail is attached`, originalEmailVisible('calendar', 2), true);
}

const ordered = orderSourceEmails([
  { id: 'old', received_at: '2026-09-01T09:00:00Z', created_at: '2026-09-01T09:01:00Z' },
  { id: 'new', received_at: '2026-09-20T18:00:00Z', created_at: '2026-09-20T18:01:00Z' },
  { id: 'mid', received_at: null, created_at: '2026-09-10T12:00:00Z' },
]);
expect(
  'thread newest first',
  ordered.map((row) => row.id),
  ['new', 'mid', 'old'],
);

expect(
  'body keeps single line breaks inside a paragraph',
  emailBodyParagraphs('Hello\nthere\n\nThanks'),
  ['Hello\nthere', 'Thanks'],
);
expect('empty body has no paragraphs', emailBodyParagraphs('  \n '), []);

const plain = splitEmailChain('Please bring a raincoat.\n\nThanks');
expect('a note with no chain stays one message', plain.length, 1);
expect('plain body is unchanged', plain[0]?.body, 'Please bring a raincoat.\n\nThanks');

const chain = splitEmailChain(`Thanks, I'll bring the form.

On 12 May 2026, at 09:41, Nursery wrote:
Please return the slip by Friday.

From: Nursery Office
Sent: 11 May 2026 4:00 PM
To: Parent
Subject: Re: Trip

Please return the slip by Friday.
`);
expect('newest writing is its own send', chain[0]?.body, "Thanks, I'll bring the form.");
expect(
  'quoted send keeps who and when',
  { sender: chain[1]?.sender, sent: chain[1]?.sent, body: chain[1]?.body },
  { sender: 'Nursery Office', sent: '11 May 2026 4:00 PM', body: 'Please return the slip by Friday.' },
);
expect('a repeated quote is not shown twice', chain.length, 2);

expect(
  'a sentence starting with From is not a new send',
  splitEmailChain('Please reply.\nFrom the office tomorrow if you can.').length,
  1,
);

const householdId = 'hh-1';
const owner = { userId: 'owner', householdId };
const partner = { userId: 'partner', householdId };
const outsider = { userId: 'outsider', householdId: 'hh-2' };
const mail = { user_id: 'owner' };
const shared = { created_by: 'owner', visibility: 'shared', household_id: householdId };
const privateItem = { created_by: 'owner', visibility: 'private', household_id: householdId };

expect('owner reads their own mail on a private item', canReadSourceEmail(mail, privateItem, owner), true);
expect('partner cannot read mail on a private item', canReadSourceEmail(mail, privateItem, partner), false);
expect('partner reads mail when the item is shared', canReadSourceEmail(mail, shared, partner), true);
expect('another household cannot read a shared item’s mail', canReadSourceEmail(mail, shared, outsider), false);
expect('deleted item stays with the mailbox owner', canReadSourceEmail(mail, null, owner), true);
expect('deleted item is hidden from the partner', canReadSourceEmail(mail, null, partner), false);
