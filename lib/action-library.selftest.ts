import { isHomeEligible, isRadarWatchItem } from './placement.ts';
import {
  ACTION_LIBRARY_SEED,
  ENGLAND_TERM_DATES_SEED,
  actionById,
  actionHoldAsPlacementItem,
  actionHoldIsRadarWatch,
  calendarResolvesAction,
  childcareDeadlineFromTerms,
  completionEvidenceKey,
  confirmActionLibraryCompletion,
  emptyActionFactsStore,
  materializeActionHolds,
  resolveActionState,
  userFacingActionCopy,
  vaccinationCopyIsSafe,
  type ActionLibraryRecord,
} from '../supabase/functions/_shared/action-library.ts';
import { receptionStartYear } from '../supabase/functions/_shared/england-admin-windows.ts';
import { insertManualFact } from '../supabase/functions/_shared/family-facts.ts';

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

const today = '2026-09-17';
const taya = { id: 'person_taya', first_name: 'Taya', birthday: '2026-09-10', role: 'child' };
const seed = ACTION_LIBRARY_SEED;

function withActive(id: string, active: boolean): ActionLibraryRecord[] {
  return seed.map((row) => (row.id === id ? { ...row, active } : row));
}

expect(
  'inactive birth registration never generates',
  materializeActionHolds({
    actions: withActive('birth-registration-england', false),
    children: [taya],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'birth-registration-england'),
  false,
);

const birthHolds = materializeActionHolds({
  actions: seed,
  children: [taya],
  items: [],
  facts: [],
  today,
});
expect(
  'birth registration generates a hold in window',
  birthHolds.some((row) => row.action_library_id === 'birth-registration-england' && row.kind === 'hold'),
  true,
);

const twelveMonthChild = { id: 'person_arlo', first_name: 'Arlo', birthday: '2025-09-17', role: 'child' };
const vaxHolds = materializeActionHolds({
  actions: seed,
  children: [twelveMonthChild],
  items: [],
  facts: [],
  today,
});
const vax = vaxHolds.find((row) => row.action_library_id === 'vaccination-check-12-months');
expect('12-month vaccination check generates', !!vax, true);
expect('vaccination copy mentions GP or health visitor', /GP or health visitor/i.test(vax?.body || ''), true);
expect('vaccination copy is clinically generic', vaccinationCopyIsSafe(`${vax?.title}\n${vax?.body}\n${vax?.action_description}`), true);
expect(
  'vaccination seed check_type is user_confirmation not calendar',
  seed.filter((row) => row.category === 'vaccination').every((row) => row.check_type === 'user_confirmation'),
  true,
);
expect(
  'unsafe vaccine copy is rejected by the safety check',
  vaccinationCopyIsSafe('Your child is due their second MMRV dose.'),
  false,
);

const weekChild = { id: 'person_neo', first_name: 'Neo', birthday: '2026-08-06', role: 'child' };
const reviewHolds = materializeActionHolds({
  actions: seed,
  children: [weekChild],
  items: [],
  facts: [],
  today,
});
expect(
  '6-8 week health review generates',
  reviewHolds.some((row) => row.action_library_id === 'six-eight-week-health-review'),
  true,
);

const action = actionById('vaccination-check-12-months')!;
expect(
  'no evidence stays unknown, never not_completed',
  resolveActionState({
    action,
    child: twelveMonthChild,
    facts: [],
    events: [],
    today,
  }),
  'unknown',
);

const factStore = emptyActionFactsStore();
insertManualFact(
  factStore,
  { person_id: twelveMonthChild.id, fact_type: 'person_attribute', content: 'Routine vaccination check completed' },
  { now: `${today}T12:00:00.000Z`, id: 'vax_done', user_id: 'user' },
);
factStore.facts[0]!.evidence_key = completionEvidenceKey(action.id);
factStore.facts[0]!.status = 'active';
expect(
  'family fact completion resolves the action',
  resolveActionState({
    action,
    child: twelveMonthChild,
    facts: factStore.facts,
    events: [],
    today,
  }),
  'completed',
);
expect(
  'completed family fact suppresses a new hold',
  materializeActionHolds({
    actions: seed,
    children: [twelveMonthChild],
    items: [],
    facts: factStore.facts,
    today,
  }).some((row) => row.action_library_id === 'vaccination-check-12-months'),
  false,
);

const confirmStore = emptyActionFactsStore();
const confirmed = confirmActionLibraryCompletion({
  store: confirmStore,
  actionId: 'birth-registration-england',
  actionName: 'Birth registration',
  personId: taya.id,
  userId: 'user',
  now: `${today}T12:00:00.000Z`,
  id: 'confirm_1',
});
expect('user confirmation source', confirmed.source, 'user_confirmation');
expect('user confirmation is active', confirmed.status, 'active');
expect(
  'user confirmation prevents recreation',
  materializeActionHolds({
    actions: seed,
    children: [taya],
    items: [],
    facts: confirmStore.facts,
    today,
  }).some((row) => row.action_library_id === 'birth-registration-england'),
  false,
);
expect(
  'linked dismissed item also prevents recreation',
  materializeActionHolds({
    actions: seed,
    children: [taya],
    items: [{ action_library_id: 'birth-registration-england', who_it_affects: 'Taya', status: 'dismissed' }],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'birth-registration-england'),
  false,
);

const review = actionById('six-eight-week-health-review')!;
expect(
  'matching 6-8 week calendar occurrence resolves',
  calendarResolvesAction({
    action: review,
    child: weekChild,
    today,
    events: [
      {
        kind: 'occurrence',
        category: 'medical',
        who_it_affects: 'Neo',
        title: '6–8 week health review',
        occurs_at: '2026-09-17',
        status: 'open',
      },
    ],
  }),
  true,
);
expect(
  'unrelated medical appointment does not resolve a health review',
  calendarResolvesAction({
    action: review,
    child: weekChild,
    today,
    events: [
      {
        kind: 'occurrence',
        category: 'medical',
        who_it_affects: 'Neo',
        title: 'Dentist checkup',
        occurs_at: '2026-09-17',
        status: 'open',
      },
    ],
  }),
  false,
);
expect(
  'vaccination holds never resolve from a calendar medical slot',
  calendarResolvesAction({
    action: actionById('vaccination-check-8-weeks')!,
    child: weekChild,
    today,
    events: [
      {
        kind: 'occurrence',
        category: 'medical',
        who_it_affects: 'Neo',
        title: 'GP appointment',
        occurs_at: '2026-09-17',
        status: 'open',
      },
    ],
  }),
  false,
);

expect(
  'childcare deadline comes from term_dates not a hardcoded date',
  childcareDeadlineFromTerms({
    birthday: '2025-12-17',
    today,
    minAgeMonths: 9,
    terms: ENGLAND_TERM_DATES_SEED,
  }),
  '2026-12-31',
);
expect(
  '30 hours first term after 9 months in Sep is January with 31 Dec deadline',
  childcareDeadlineFromTerms({
    birthday: '2025-12-17',
    today: '2026-09-17',
    minAgeMonths: 9,
    terms: ENGLAND_TERM_DATES_SEED,
  }),
  '2026-12-31',
);

const ivy = { id: 'p', first_name: 'Ivy', birthday: '2025-12-17', role: 'child' };
expect(
  '30 hours generates inside the GOV.UK apply window',
  materializeActionHolds({
    actions: seed,
    children: [ivy],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'childcare-30-hours-from-9-months'),
  true,
);

const arlo = { id: 'arlo', first_name: 'Arlo', birthday: '2023-07-09', role: 'child' };
const tayaSchool = { id: 'taya_school', first_name: 'Taya', birthday: '2025-07-05', role: 'child' };
expect('Arlo reception year is 2027', receptionStartYear('2023-07-09'), 2027);
expect(
  'Arlo primary application is due in Sep 2026',
  materializeActionHolds({
    actions: seed,
    children: [arlo],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'primary-school-application'),
  true,
);
expect(
  'Arlo hold is titled as reception application',
  materializeActionHolds({
    actions: seed,
    children: [arlo],
    items: [],
    facts: [],
    today,
  }).find((row) => row.action_library_id === 'primary-school-application')?.title,
  "Arlo's reception application",
);
expect(
  'Taya is not yet in primary application window',
  materializeActionHolds({
    actions: seed,
    children: [tayaSchool],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'primary-school-application'),
  false,
);
expect(
  'primary offer day is not due in September',
  materializeActionHolds({
    actions: seed,
    children: [arlo],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'primary-school-offer-day'),
  false,
);
expect(
  'primary offer day is due in April 2027',
  materializeActionHolds({
    actions: seed,
    children: [arlo],
    items: [],
    facts: [],
    today: '2027-04-16',
  }).some((row) => row.action_library_id === 'primary-school-offer-day'),
  true,
);

const birthDraft = birthHolds.find((row) => row.action_library_id === 'birth-registration-england')!;
expect('action library hold is a radar watch item', actionHoldIsRadarWatch(birthDraft, new Date(2026, 8, 17)), true);
expect(
  'action library hold is not a Home action',
  isHomeEligible(actionHoldAsPlacementItem(birthDraft), new Date(2026, 8, 17)),
  false,
);
expect(
  'plain hold placement still treats kind=hold as radar',
  isRadarWatchItem({ id: 'h', title: "Taya's Birth registration", kind: 'hold', status: 'open' }, new Date(2026, 8, 17)),
  true,
);

const hoursChild = { id: 'nb', first_name: 'Nia', birthday: '2026-09-16', role: 'child' };
const daysChild = taya;
const weeksChild = weekChild;
const monthsChild = twelveMonthChild;
expect(
  'hours unit (newborn physical) compares correctly',
  materializeActionHolds({
    actions: seed,
    children: [hoursChild],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'newborn-physical-examination'),
  true,
);
expect(
  'days unit (birth registration) compares correctly',
  materializeActionHolds({
    actions: seed,
    children: [daysChild],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'birth-registration-england'),
  true,
);
expect(
  'weeks unit (6-8 week review) compares correctly',
  materializeActionHolds({
    actions: seed,
    children: [weeksChild],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'six-eight-week-health-review'),
  true,
);
expect(
  'months unit (12-month vaccination check) compares correctly',
  materializeActionHolds({
    actions: seed,
    children: [monthsChild],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'vaccination-check-12-months'),
  true,
);

const tooOld = { id: 'old', first_name: 'Otto', birthday: '2020-01-01', role: 'child' };
expect(
  'birth registration does not generate outside its day window',
  materializeActionHolds({
    actions: seed,
    children: [tooOld],
    items: [],
    facts: [],
    today,
  }).some((row) => row.action_library_id === 'birth-registration-england'),
  false,
);

const copy = userFacingActionCopy(action, 'Arlo', { days: 365, weeks: 52, months: 12, hours: 8760, years: 1, label: '12 months' });
expect('around-12-months copy', copy.body.includes('around 12 months old'), true);

if (!process.exitCode) console.log('action-library self-test passed');
