import { insightRepeatsCaptured, isUsableInsight, looksLikeMentalLoad } from '../supabase/functions/_shared/noticed.ts';

function expect(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    console.error(`FAIL ${name}: got ${a}, want ${b}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

const captured = [
  "Arlo's swimming gala Thursday",
  'Swimming gala — medical form',
  'Goggles',
  'Return the farm trip permission slip',
];

expect(
  'old gala recap is treated as captured',
  insightRepeatsCaptured("Don't forget Arlo's swimming gala and the medical form.", captured),
  true,
);
expect(
  'farm slip recap is treated as captured',
  insightRepeatsCaptured('The farm trip permission slip still needs returning.', captured),
  true,
);
expect(
  'dentist thought is not a captured recap',
  insightRepeatsCaptured('Arlo is probably due a dentist check around now — want me to add booking it?', captured),
  false,
);
expect('dentist thought looks like mental load', looksLikeMentalLoad('Arlo is probably due a dentist check around now'), true);
expect('gala recap is usable by the old filter', isUsableInsight("Don't forget Arlo's swimming gala and the medical form."), true);
