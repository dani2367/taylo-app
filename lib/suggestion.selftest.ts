import { helpfulSuggestion } from './suggestion';

function expect(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect(
  'uses stored suggestion',
  helpfulSuggestion({
    title: 'Farm trip',
    body: 'Friday',
    detail: 'Year 2 go to Ashdown Farm on Friday.',
    suggestion: 'I can draft the slip reply if you want it sent.',
  }),
  'I can draft the slip reply if you want it sent.',
);

expect(
  'drops suggestion that restates detail',
  helpfulSuggestion({
    title: 'Farm trip',
    detail: 'Return the permission slip by Friday.',
    suggestion: 'Return the permission slip by Friday.',
  }),
  null,
);

expect(
  'does not invent a passport template',
  helpfulSuggestion({ title: 'Renew passport', body: 'Expires in March', detail: 'The current passport expires in March.', suggestion: null }),
  null,
);

if (!process.exitCode) console.log('suggestion self-test passed');
