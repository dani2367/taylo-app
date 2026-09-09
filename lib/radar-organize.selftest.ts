import { classifyStandaloneItem, isSimpleUserTodo, nestedListCount, simpleListTitle } from './radar-organize.ts';
import { looksLikeGroceryProduct } from './shopping';

function expect(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect('wine → shopping', classifyStandaloneItem({ title: 'Wine', category: 'errand' }), 'shopping');
expect(
  "dad's present → todo",
  classifyStandaloneItem({ title: "Get Dad's present", source: 'chat' }),
  'todo',
);
expect('call doctor → todo', classifyStandaloneItem({ title: 'Call doctor', source: 'manual' }), 'todo');
expect(
  'dental from email → radar',
  classifyStandaloneItem({ title: 'Book your dental checkup', source: 'email', category: 'medical' }),
  'radar',
);
expect(
  'dental undated still radar',
  classifyStandaloneItem({ title: 'Book your dental checkup', source: 'email' }),
  'radar',
);
expect('dated tennis → radar', classifyStandaloneItem({ title: 'Junior tennis', event_date: '2026-09-07', source: 'email' }), 'radar');
expect(
  'farm trip checklist from email stays radar',
  classifyStandaloneItem({
    title: 'Return the farm trip permission slip',
    event_date: '2025-09-09',
    checklistCount: 4,
    source: 'email',
  }),
  'radar',
);
expect(
  'group sessions from calendar stay radar',
  classifyStandaloneItem({
    title: 'Group sessions',
    checklistCount: 3,
    source: 'calendar',
  }),
  'radar',
);
expect(
  'offload farm packing → general to do',
  classifyStandaloneItem({
    title: 'Farm trip',
    checklistCount: 4,
    source: 'chat',
  }),
  'todo',
);
expect('shopping title', classifyStandaloneItem({ title: 'Shopping' }), 'shopping');
expect('wine grocery', looksLikeGroceryProduct('Wine', 'errand'), true);
expect('shoes not grocery', looksLikeGroceryProduct("Buy Arlo's shoes for wedding"), false);
expect(
  'shoes from email stay radar',
  classifyStandaloneItem({ title: "Buy Arlo's shoes for wedding", source: 'email' }),
  'radar',
);
expect(
  'birthday card from email stays radar',
  classifyStandaloneItem({ title: "Buy card for Arlo's birthday", source: 'email' }),
  'radar',
);
expect(
  'birthday card offload → todo',
  classifyStandaloneItem({ title: "Buy card for Arlo's birthday", source: 'chat' }),
  'todo',
);
expect(
  'accommodation offload → todo',
  classifyStandaloneItem({ title: 'Accommodation for bootcamp', source: 'chat', category: 'errand' }),
  'todo',
);
expect(
  'eye test offload → general to do',
  classifyStandaloneItem({ title: "Book Taya's eye test", source: 'chat' }),
  'todo',
);
expect('present not grocery', looksLikeGroceryProduct("Get Dad's present"), false);
expect('user todo', isSimpleUserTodo({ title: "Get Dad's present", source: 'chat' }), true);
expect('present from email is todo', isSimpleUserTodo({ title: "Get Dad's present", source: 'email' }), true);
expect('empty shopping hub is 0 items', nestedListCount([]), 0);
expect('all-done shopping children are 0 items', nestedListCount([{ status: 'done' }, { status: 'done' }]), 0);
expect('open shopping children count', nestedListCount([{ status: 'open' }, { status: 'done' }]), 1);

expect('farm trip title', simpleListTitle('Return the farm trip permission slip'), 'Farm trip');
expect('teddy list title', simpleListTitle('Get Teddy a party present'), "Teddy's party");

if (!process.exitCode) console.log('radar-organize self-test passed');
