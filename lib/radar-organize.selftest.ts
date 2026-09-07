import { classifyStandaloneItem, isSimpleUserTodo, LIST_FROM_CHECKLIST_MIN, simpleListTitle } from './radar-organize';
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
  'farm trip checklist → list',
  classifyStandaloneItem({
    title: 'Return the farm trip permission slip',
    event_date: '2025-09-09',
    checklistCount: 4,
    source: 'email',
  }),
  'list',
);
expect('shopping title', classifyStandaloneItem({ title: 'Shopping' }), 'shopping');
expect('wine grocery', looksLikeGroceryProduct('Wine', 'errand'), true);
expect('shoes not grocery', looksLikeGroceryProduct("Buy Arlo's shoes for wedding"), false);
expect(
  'shoes from email → todo',
  classifyStandaloneItem({ title: "Buy Arlo's shoes for wedding", source: 'email' }),
  'todo',
);
expect(
  'birthday card from email → todo',
  classifyStandaloneItem({ title: "Buy card for Arlo's birthday", source: 'email' }),
  'todo',
);
expect(
  'birthday card → todo',
  classifyStandaloneItem({ title: "Buy card for Arlo's birthday", source: 'chat' }),
  'todo',
);
expect('present not grocery', looksLikeGroceryProduct("Get Dad's present"), false);
expect('user todo', isSimpleUserTodo({ title: "Get Dad's present", source: 'chat' }), true);
expect('present from email is todo', isSimpleUserTodo({ title: "Get Dad's present", source: 'email' }), true);
expect('farm trip title', simpleListTitle('Return the farm trip permission slip'), 'Farm trip');
expect('teddy list title', simpleListTitle('Get Teddy a party present'), "Teddy's party");
expect('min list size', LIST_FROM_CHECKLIST_MIN, 2);

if (!process.exitCode) console.log('radar-organize self-test passed');
