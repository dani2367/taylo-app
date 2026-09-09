import { isGroceryCapture, looksLikeGroceryProduct } from './shopping';

function expect(name: string, got: unknown, want: unknown) {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${name}`);
}

expect('need milk → grocery', isGroceryCapture('I need some milk'), true);
expect('buy bread → grocery', isGroceryCapture('buy bread'), true);
expect('need accommodation → todo', isGroceryCapture('I need accommodation for bootcamp'), false);
expect('accommodation title not grocery', looksLikeGroceryProduct('Accommodation for bootcamp', 'errand'), false);
expect('wine still grocery', looksLikeGroceryProduct('Wine', 'errand'), true);
expect('olive oil errand', looksLikeGroceryProduct('Olive oil', 'errand'), true);
expect('need turmeric', isGroceryCapture('I need turmeric'), true);
expect('need to book → not grocery', isGroceryCapture('I need to book accommodation'), false);
expect(
  'oat milk plus email teacher is not grocery-only',
  isGroceryCapture("We're out of oat milk and I still need to email Taya's teacher about swimming"),
  false,
);

if (!process.exitCode) console.log('shopping self-test passed');
