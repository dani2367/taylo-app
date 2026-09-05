import { narrativeFromSourceEmail } from './email-narrative';

function expect(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

const farm = narrativeFromSourceEmail(
  {
    subject: 'Year 2 trip to the farm – Tuesday 9 September',
    body: `Hi,

Just a reminder that Year 2 are going to Ashdown Farm on Tuesday 9 September.

Please return the permission slip by Friday if you haven’t already.

Children will need:
- a packed lunch (no nuts)
- a named water bottle
- waterproof coat and wellies
- a change of socks

We’ll be back for normal pickup.

Thanks,
Mrs Patel`,
  },
  'Return the farm trip permission slip',
);

expect('farm body mentions farm', /\bAshdown Farm\b/.test(farm.body || ''), true);
expect('farm detail has slip', /permission slip/i.test(farm.detail || ''), true);
expect('farm detail has kit', /packed lunch/i.test(farm.detail || ''), true);
expect('farm suggestion is an action', /return/i.test(farm.suggestion || ''), true);

if (!process.exitCode) console.log('email-narrative self-test passed');
