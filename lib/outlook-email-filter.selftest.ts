import {
  looksFamilyRelevant,
  outlookPrefilterReason,
} from '../supabase/functions/_shared/outlook-email-filter.ts';

function expect(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect(
  'other + promo is dropped',
  outlookPrefilterReason({
    inferenceClassification: 'other',
    subject: 'New arrivals',
    bodyPreview: 'Shop the latest drop',
  }),
  'outlook_other',
);

expect(
  'other + sports day is kept',
  outlookPrefilterReason({
    inferenceClassification: 'other',
    subject: "Arlo's sports day",
    bodyPreview: 'Please return the trip form',
  }),
  null,
);

expect(
  'focused promo is not dropped by Outlook split',
  outlookPrefilterReason({
    inferenceClassification: 'focused',
    subject: 'Your points expire in 14 days',
    bodyPreview: 'Use them in store',
  }),
  null,
);

expect(
  'bulk header without family hint is dropped',
  outlookPrefilterReason({
    inferenceClassification: 'focused',
    subject: 'September perks',
    internetMessageHeaders: [{ name: 'List-Unsubscribe', value: '<https://x.com/unsub>' }],
  }),
  'bulk',
);

expect(
  'missing classification is kept',
  outlookPrefilterReason({ subject: 'Hello from Jane' }),
  null,
);

expect(
  'NHS in Other is family-relevant',
  looksFamilyRelevant({ subject: 'Your NHS appointment is confirmed' }),
  true,
);

if (!process.exitCode) console.log('outlook-email-filter self-test passed');
