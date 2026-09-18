import { resolvePlanIcon } from './plan-icon.ts';

function expect(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect(
  "Oliver's wedding is a heart, not a bike or a gift",
  resolvePlanIcon({
    title: "Oliver's wedding",
    category: 'activity',
    stored: 'bicycle-outline',
  }).name,
  'heart-outline',
);
expect(
  'wedding reception stays a wedding, not a present',
  resolvePlanIcon({ title: "Oliver's wedding reception", category: 'activity' }).name,
  'heart-outline',
);
expect(
  'ring in wedding does not become a phone',
  resolvePlanIcon({ title: 'Wedding ring fitting' }).name,
  'heart-outline',
);
expect(
  "Arlo's reception application is paperwork, not a present",
  resolvePlanIcon({
    title: "Arlo's reception application",
    category: 'school',
    stored: 'school-outline',
  }).name,
  'document-text-outline',
);
expect(
  'spa day is wellness, not a graduation hat',
  resolvePlanIcon({
    title: 'Spa day',
    category: 'school',
    stored: 'school-outline',
  }).name,
  'flower-outline',
);
expect(
  'activity category without a better title is a calendar, not a bike',
  resolvePlanIcon({ title: 'Afternoon out', category: 'activity', stored: 'bicycle-outline' }).name,
  'calendar-outline',
);
expect(
  'swimming gala uses water, not a bike',
  resolvePlanIcon({ title: 'Swimming gala', category: 'activity' }).name,
  'water-outline',
);
expect(
  'football training uses the sport icon',
  resolvePlanIcon({ title: 'Football training', category: 'activity' }).name,
  'fitness-outline',
);
expect(
  'Year 2 London trip stays travel',
  resolvePlanIcon({ title: 'Year 2 London trip', category: 'school' }).name,
  'airplane-outline',
);
expect(
  'permission form is paperwork not a gift',
  resolvePlanIcon({ title: 'Permission form' }).name,
  'document-text-outline',
);
expect(
  'buy a card is a gift',
  resolvePlanIcon({ title: 'Buy a card for Teddy' }).name,
  'gift-outline',
);
expect(
  'report card is not a gift',
  resolvePlanIcon({ title: 'Report card from school' }).name,
  'school-outline',
);
expect(
  'shoes for the wedding are an errand, not a heart',
  resolvePlanIcon({ title: "Buy Arlo's shoes for the wedding" }).name,
  'cart-outline',
);
expect(
  'birthday still uses the gift',
  resolvePlanIcon({ title: "Mia's birthday party" }).name,
  'gift-outline',
);
expect(
  'parents evening is school',
  resolvePlanIcon({ title: "Taya's parents evening", category: 'activity' }).name,
  'school-outline',
);

if (!process.exitCode) console.log('plan-icon self-test passed');
