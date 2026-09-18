import { isRadarWatchItem, type PlacementItem } from './placement.ts';
import {
  addCalendarMonthsYmd,
  addDaysYmd,
  ageFromBirthday,
  formatYmd,
  parseYmd,
  ymdToUtcDate,
  type ChildAge,
  type WindowUnit,
} from './child-age.ts';
import {
  emptyFactsStore,
  insertManualFact,
  type FamilyFact,
  type FamilyFactsStore,
} from './family-facts.ts';
import {
  englandFundedChildcareTerms,
  isChildcareActionDue,
  isSchoolYearActionDue,
  GOVUK_ADMIN_VERIFIED_ON,
} from './england-admin-windows.ts';

export const ACTION_CATEGORIES = [
  'vaccination',
  'health_review',
  'newborn',
  'administration',
  'childcare',
  'education',
] as const;
export const ACTION_TRIGGER_TYPES = ['child_age', 'birth_date', 'child_age_and_term', 'school_year'] as const;
export const ACTION_WINDOW_UNITS = ['hours', 'days', 'weeks', 'months'] as const;
export const ACTION_CHECK_TYPES = ['calendar', 'family_fact', 'user_confirmation'] as const;
export const ACTION_RESOLUTION_STATES = ['completed', 'not_completed', 'unknown'] as const;

export type ActionCategory = (typeof ACTION_CATEGORIES)[number];
export type ActionTriggerType = (typeof ACTION_TRIGGER_TYPES)[number];
export type ActionCheckType = (typeof ACTION_CHECK_TYPES)[number];
export type ActionResolution = (typeof ACTION_RESOLUTION_STATES)[number];

export type ActionLibraryRecord = {
  id: string;
  name: string;
  category: ActionCategory;
  jurisdiction: string;
  trigger_type: ActionTriggerType;
  window_start: number | null;
  window_end: number | null;
  window_unit: WindowUnit | null;
  lead_window_days: number;
  check_type: ActionCheckType;
  action_description: string;
  source: string;
  source_url: string | null;
  last_verified: string | null;
  needs_verification: boolean;
  active: boolean;
};

export type TermDateRecord = {
  id: string;
  term_name: string;
  term_start_date: string;
  application_deadline: string | null;
  effective_from: string | null;
  effective_to: string | null;
  jurisdiction: string;
};

export type ActionChild = {
  id: string;
  first_name: string;
  birthday: string | null;
  role?: string | null;
};

export type LinkedActionItem = {
  id?: string;
  action_library_id: string | null;
  who_it_affects?: string | null;
  status?: string | null;
  kind?: string | null;
  source?: string | null;
  title?: string | null;
};

export type CalendarOccurrence = {
  kind?: string | null;
  category?: string | null;
  who_it_affects?: string | null;
  occurs_at?: string | null;
  event_date?: string | null;
  title?: string | null;
  status?: string | null;
};

export type ActionHoldDraft = {
  title: string;
  body: string;
  action_description: string;
  kind: 'hold';
  source: 'action_library';
  source_label: string;
  action_library_id: string;
  who_it_affects: string;
  status: 'open';
  due_at: null;
  category: string;
  confidence: 'medium';
};

function rec(partial: ActionLibraryRecord): ActionLibraryRecord {
  return partial;
}

export const ACTION_LIBRARY_SEED: ActionLibraryRecord[] = [
  rec({
    id: 'birth-registration-england',
    name: 'Birth registration',
    category: 'administration',
    jurisdiction: 'England',
    trigger_type: 'birth_date',
    window_start: 0,
    window_end: 42,
    window_unit: 'days',
    lead_window_days: 0,
    check_type: 'family_fact',
    action_description: "Register the child's birth within the applicable statutory period.",
    source: 'GOV.UK',
    source_url: 'https://www.gov.uk/register-birth',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'newborn-physical-examination',
    name: 'Newborn physical examination',
    category: 'newborn',
    jurisdiction: 'England',
    trigger_type: 'birth_date',
    window_start: 0,
    window_end: 72,
    window_unit: 'hours',
    lead_window_days: 0,
    check_type: 'family_fact',
    action_description: 'Check that the newborn physical examination has been completed.',
    source: 'NHS',
    source_url: 'https://www.nhs.uk/baby/newborn-screening/physical-examination/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'newborn-blood-spot',
    name: 'Newborn blood spot screening',
    category: 'newborn',
    jurisdiction: 'England',
    trigger_type: 'birth_date',
    window_start: 5,
    window_end: 8,
    window_unit: 'days',
    lead_window_days: 2,
    check_type: 'family_fact',
    action_description: 'Check that the newborn blood spot screening test has been completed or arranged.',
    source: 'NHS',
    source_url: 'https://www.nhs.uk/baby/newborn-screening/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'newborn-hearing-screen',
    name: 'Newborn hearing screening',
    category: 'newborn',
    jurisdiction: 'England',
    trigger_type: 'birth_date',
    window_start: 0,
    window_end: 42,
    window_unit: 'days',
    lead_window_days: 0,
    check_type: 'family_fact',
    action_description: 'Check that the newborn hearing screening has been completed or arranged.',
    source: 'NHS',
    source_url: 'https://www.nhs.uk/baby/newborn-screening/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'six-eight-week-health-review',
    name: '6–8 week health review',
    category: 'health_review',
    jurisdiction: 'England',
    trigger_type: 'child_age',
    window_start: 6,
    window_end: 8,
    window_unit: 'weeks',
    lead_window_days: 14,
    check_type: 'calendar',
    action_description: "Check whether your baby's 6–8 week health review has been booked or completed.",
    source: 'NHS',
    source_url: 'https://www.nhs.uk/baby/babys-development/height-weight-and-reviews/baby-reviews/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'vaccination-check-8-weeks',
    name: 'Routine vaccination check',
    category: 'vaccination',
    jurisdiction: 'England',
    trigger_type: 'child_age',
    window_start: 8,
    window_end: 9,
    window_unit: 'weeks',
    lead_window_days: 7,
    check_type: 'user_confirmation',
    action_description:
      'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    source: 'NHS',
    source_url: 'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'vaccination-check-12-weeks',
    name: 'Routine vaccination check',
    category: 'vaccination',
    jurisdiction: 'England',
    trigger_type: 'child_age',
    window_start: 12,
    window_end: 13,
    window_unit: 'weeks',
    lead_window_days: 7,
    check_type: 'user_confirmation',
    action_description:
      'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    source: 'NHS',
    source_url: 'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'vaccination-check-16-weeks',
    name: 'Routine vaccination check',
    category: 'vaccination',
    jurisdiction: 'England',
    trigger_type: 'child_age',
    window_start: 16,
    window_end: 17,
    window_unit: 'weeks',
    lead_window_days: 7,
    check_type: 'user_confirmation',
    action_description:
      'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    source: 'NHS',
    source_url: 'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'vaccination-check-12-months',
    name: 'Routine vaccination check',
    category: 'vaccination',
    jurisdiction: 'England',
    trigger_type: 'child_age',
    window_start: 12,
    window_end: 13,
    window_unit: 'months',
    lead_window_days: 14,
    check_type: 'user_confirmation',
    action_description:
      'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    source: 'NHS',
    source_url: 'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'vaccination-check-18-months',
    name: 'Routine vaccination check',
    category: 'vaccination',
    jurisdiction: 'England',
    trigger_type: 'child_age',
    window_start: 18,
    window_end: 19,
    window_unit: 'months',
    lead_window_days: 14,
    check_type: 'user_confirmation',
    action_description:
      'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    source: 'NHS',
    source_url: 'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'nine-twelve-month-health-review',
    name: '9–12 month health review',
    category: 'health_review',
    jurisdiction: 'England',
    trigger_type: 'child_age',
    window_start: 9,
    window_end: 12,
    window_unit: 'months',
    lead_window_days: 28,
    check_type: 'calendar',
    action_description:
      "Check whether your child's 9–12 month health and development review has been offered or completed.",
    source: 'NHS',
    source_url: 'https://www.nhs.uk/baby/babys-development/height-weight-and-reviews/baby-reviews/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'two-year-health-review',
    name: '2–2½ year health review',
    category: 'health_review',
    jurisdiction: 'England',
    trigger_type: 'child_age',
    window_start: 24,
    window_end: 30,
    window_unit: 'months',
    lead_window_days: 28,
    check_type: 'calendar',
    action_description:
      "Check whether your child's 2–2½ year health and development review has been offered or completed.",
    source: 'NHS',
    source_url: 'https://www.nhs.uk/baby/babys-development/height-weight-and-reviews/baby-reviews/',
    last_verified: null,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'childcare-30-hours-from-9-months',
    name: '30 hours funded childcare from 9 months',
    category: 'childcare',
    jurisdiction: 'England',
    trigger_type: 'child_age_and_term',
    window_start: 9,
    window_end: null,
    window_unit: 'months',
    lead_window_days: 42,
    check_type: 'family_fact',
    action_description:
      'Check whether your family is eligible for funded childcare and whether an application is needed for the upcoming term.',
    source: 'GOV.UK',
    source_url: 'https://www.gov.uk/free-childcare-if-working/when-to-apply',
    last_verified: GOVUK_ADMIN_VERIFIED_ON,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'childcare-15-hours-from-3',
    name: 'Universal 15 hours from age 3',
    category: 'childcare',
    jurisdiction: 'England',
    trigger_type: 'child_age_and_term',
    window_start: 36,
    window_end: null,
    window_unit: 'months',
    lead_window_days: 42,
    check_type: 'family_fact',
    action_description:
      'Check the funded childcare entitlement available for your child from the relevant term after their third birthday.',
    source: 'GOV.UK',
    source_url: 'https://www.gov.uk/help-with-childcare-costs/free-childcare-and-education-for-3-to-4-year-olds',
    last_verified: GOVUK_ADMIN_VERIFIED_ON,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'primary-school-application',
    name: 'Primary school application',
    category: 'education',
    jurisdiction: 'England',
    trigger_type: 'school_year',
    window_start: null,
    window_end: null,
    window_unit: null,
    lead_window_days: 42,
    check_type: 'family_fact',
    action_description: 'Check whether a primary school application is needed for the relevant admissions year.',
    source: 'GOV.UK',
    source_url: 'https://www.gov.uk/schools-admissions/how-to-apply',
    last_verified: GOVUK_ADMIN_VERIFIED_ON,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'secondary-school-application',
    name: 'Secondary school application',
    category: 'education',
    jurisdiction: 'England',
    trigger_type: 'school_year',
    window_start: null,
    window_end: null,
    window_unit: null,
    lead_window_days: 42,
    check_type: 'family_fact',
    action_description: 'Check whether a secondary school application is needed for the relevant admissions year.',
    source: 'GOV.UK',
    source_url: 'https://www.gov.uk/schools-admissions/how-to-apply',
    last_verified: GOVUK_ADMIN_VERIFIED_ON,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'primary-school-offer-day',
    name: 'Primary school offer day',
    category: 'education',
    jurisdiction: 'England',
    trigger_type: 'school_year',
    window_start: null,
    window_end: null,
    window_unit: null,
    lead_window_days: 14,
    check_type: 'user_confirmation',
    action_description: 'Check primary school offer day for the relevant admissions year.',
    source: 'GOV.UK',
    source_url: 'https://www.gov.uk/schools-admissions/how-to-apply',
    last_verified: GOVUK_ADMIN_VERIFIED_ON,
    needs_verification: false,
    active: true,
  }),
  rec({
    id: 'secondary-school-offer-day',
    name: 'Secondary school offer day',
    category: 'education',
    jurisdiction: 'England',
    trigger_type: 'school_year',
    window_start: null,
    window_end: null,
    window_unit: null,
    lead_window_days: 14,
    check_type: 'user_confirmation',
    action_description: 'Check secondary school offer day for the relevant admissions year.',
    source: 'GOV.UK',
    source_url: 'https://www.gov.uk/schools-admissions/how-to-apply',
    last_verified: GOVUK_ADMIN_VERIFIED_ON,
    needs_verification: false,
    active: true,
  }),
];

export function actionById(id: string, records = ACTION_LIBRARY_SEED): ActionLibraryRecord | null {
  return records.find((row) => row.id === id) ?? null;
}

export function completionEvidenceKey(actionId: string): string {
  return `action_library:${actionId}:completed`;
}

function sameName(a?: string | null, b?: string | null): boolean {
  const left = (a || '').trim().toLowerCase();
  const right = (b || '').trim().toLowerCase();
  return !!left && left === right;
}

function windowInstant(dob: ReturnType<typeof parseYmd> & object, amount: number, unit: WindowUnit): number {
  const born = dob as NonNullable<ReturnType<typeof parseYmd>>;
  if (unit === 'hours') return ymdToUtcDate(born).getTime() + amount * 3600000;
  if (unit === 'days') return ymdToUtcDate(addDaysYmd(born, amount)).getTime();
  if (unit === 'weeks') return ymdToUtcDate(addDaysYmd(born, amount * 7)).getTime();
  return ymdToUtcDate(addCalendarMonthsYmd(born, amount)).getTime();
}

export function isWithinActionWindow(params: {
  action: ActionLibraryRecord;
  birthday: string | null;
  today: string;
}): boolean {
  const { action, birthday, today } = params;
  if (action.window_start == null || !action.window_unit) return false;
  const dob = parseYmd(birthday);
  const todayYmd = parseYmd(today);
  if (!dob || !todayYmd) return false;
  const todayMs = ymdToUtcDate(todayYmd).getTime();
  const startMs = windowInstant(dob, action.window_start, action.window_unit);
  const leadStart = startMs - action.lead_window_days * 86400000;
  if (todayMs < leadStart) return false;
  if (action.window_end == null) return true;
  const endMs = windowInstant(dob, action.window_end, action.window_unit);
  return todayMs <= endMs;
}

export function actionItemCategory(category: ActionCategory): string {
  if (category === 'education' || category === 'childcare') return 'school';
  if (category === 'administration') return 'home';
  return 'medical';
}

const VACCINE_NAME_RE =
  /\b(mmrv?|men(?:b|c|acwy)|hib|pcv|ipv|dtap|tdap|hexavalent|6-in-1|4-in-1|rotavirus|hepatitis\s*b|hpv|bcg)\b/i;
const VACCINE_DOSE_RE = /\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+dose\b|\bdose\s+\d\b|\bbooster\s+dose\b/i;
const VACCINE_COHORT_RE = /\b(born on or after|birth cohort|eligible cohort)\b/i;

export function vaccinationCopyIsSafe(text: string): boolean {
  if (VACCINE_NAME_RE.test(text)) return false;
  if (VACCINE_DOSE_RE.test(text)) return false;
  if (VACCINE_COHORT_RE.test(text)) return false;
  return true;
}

export function aroundAgeLabel(age: ChildAge | null, action: ActionLibraryRecord): string {
  if (action.window_unit === 'weeks' && action.window_start != null) {
    return `around ${action.window_start} weeks old`;
  }
  if (action.window_unit === 'months' && action.window_start != null) {
    if (action.window_start === 12) return 'around 12 months old';
    if (action.window_start === 18) return 'around 18 months old';
    if (action.window_start >= 24) return `around ${Math.round(action.window_start / 12)} years old`;
    return `around ${action.window_start} months old`;
  }
  if (!age) return 'this age';
  return `around ${age.label} old`;
}

export function userFacingActionCopy(
  action: ActionLibraryRecord,
  childName: string,
  age: ChildAge | null,
): { title: string; body: string; action_description: string } {
  const title = `${childName}'s ${action.name}`;
  if (action.category === 'vaccination') {
    const body = `${childName} is ${aroundAgeLabel(age, action)}. It may be worth checking whether they're due any routine vaccinations — your GP or health visitor can confirm.`;
    return { title, body, action_description: action.action_description };
  }
  if (action.id === 'birth-registration-england') {
    return {
      title,
      body: `It may be worth checking ${childName}'s birth registration is in hand — GOV.UK has the current statutory window.`,
      action_description: action.action_description,
    };
  }
  if (action.id === 'childcare-30-hours-from-9-months') {
    return {
      title,
      body: `It may be worth checking whether you're eligible for funded childcare for ${childName}, and whether an application is needed for the upcoming term. GOV.UK has the current dates.`,
      action_description: action.action_description,
    };
  }
  if (action.id === 'childcare-15-hours-from-3') {
    return {
      title,
      body: `It may be worth checking ${childName}'s 15 hours funded childcare with your provider — it usually starts the term after they turn three.`,
      action_description: action.action_description,
    };
  }
  if (action.id === 'primary-school-application') {
    return {
      title: `${childName}'s reception application`,
      body: `It may be worth checking ${childName}'s reception place with your local council. Primary applications usually close on 15 January.`,
      action_description: action.action_description,
    };
  }
  if (action.id === 'secondary-school-application') {
    return {
      title,
      body: `It may be worth checking ${childName}'s secondary school application with your local council. Applications usually close on 31 October.`,
      action_description: action.action_description,
    };
  }
  if (action.id === 'primary-school-offer-day') {
    return {
      title,
      body: `Primary school offers are usually sent on 16 April (or the next working day). Your council will confirm ${childName}'s offer.`,
      action_description: action.action_description,
    };
  }
  if (action.id === 'secondary-school-offer-day') {
    return {
      title,
      body: `Secondary school offers are usually sent on 1 March (or the next working day). Your council will confirm ${childName}'s offer.`,
      action_description: action.action_description,
    };
  }
  return {
    title,
    body: `${childName} is ${aroundAgeLabel(age, action)}. ${action.action_description}`,
    action_description: action.action_description,
  };
}

export function hasLinkedActionItem(
  items: LinkedActionItem[],
  actionId: string,
  childName: string,
): boolean {
  return items.some(
    (row) => row.action_library_id === actionId && sameName(row.who_it_affects, childName),
  );
}

export function hasCompletionFact(
  facts: FamilyFact[],
  actionId: string,
  personId: string | null,
): boolean {
  const key = completionEvidenceKey(actionId);
  return facts.some(
    (row) =>
      row.status === 'active' &&
      row.evidence_key === key &&
      (personId == null || row.person_id === personId),
  );
}

const HEALTH_REVIEW_TITLE: Record<string, RegExp> = {
  'six-eight-week-health-review':
    /\b(6\s*[–-]\s*8\s*week|six[\s-]*eight\s*week|8[\s-]*week\s+(?:check|review)|health visitor|baby check|newborn check)\b/i,
  'nine-twelve-month-health-review':
    /\b(9\s*[–-]\s*12\s*month|nine[\s-]*twelve\s*month|1[\s-]*year\s+(?:review|check)|health and development review)\b/i,
  'two-year-health-review':
    /\b(2(?:\s*[–-]\s*|[\s-])?(?:1\/2|½|2\.5|2)\s*year|two[\s-]*year\s+(?:review|check)|health and development review)\b/i,
};

export function calendarResolvesAction(params: {
  action: ActionLibraryRecord;
  child: ActionChild;
  events: CalendarOccurrence[];
  today: string;
}): boolean {
  const { action, child, events } = params;
  if (action.check_type !== 'calendar') return false;
  // Vaccination holds are a prompt to check with GP/HV, not a claim that a named jab is due.
  // Calendar rows are too coarse (any medical slot in the window) to prove that check happened,
  // so vaccination never auto-resolves from calendar even if check_type were set incorrectly.
  if (action.category === 'vaccination') return false;
  const pattern = HEALTH_REVIEW_TITLE[action.id];
  if (!pattern) return false;
  return events.some((event) => {
    if ((event.kind || '').toLowerCase() !== 'occurrence') return false;
    if ((event.status || 'open').toLowerCase() === 'dismissed') return false;
    if ((event.category || '').toLowerCase() !== 'medical') return false;
    if (!sameName(event.who_it_affects, child.first_name)) return false;
    if (!pattern.test(event.title || '')) return false;
    const when = event.occurs_at || event.event_date;
    if (!when) return false;
    return isWithinActionWindow({ action, birthday: child.birthday, today: when });
  });
}

export function resolveActionState(params: {
  action: ActionLibraryRecord;
  child: ActionChild;
  facts: FamilyFact[];
  events: CalendarOccurrence[];
  today: string;
}): ActionResolution {
  if (hasCompletionFact(params.facts, params.action.id, params.child.id)) return 'completed';
  if (calendarResolvesAction(params)) return 'completed';
  return 'unknown';
}

export const ENGLAND_TERM_DATES_SEED = englandFundedChildcareTerms();

export function actionIsDue(params: {
  action: ActionLibraryRecord;
  birthday: string | null;
  today: string;
  terms?: TermDateRecord[];
}): boolean {
  const { action, birthday, today } = params;
  if (!birthday) return false;
  const terms = params.terms?.length ? params.terms : ENGLAND_TERM_DATES_SEED;
  if (action.trigger_type === 'child_age' || action.trigger_type === 'birth_date') {
    return isWithinActionWindow({ action, birthday, today });
  }
  if (action.trigger_type === 'child_age_and_term') {
    return isChildcareActionDue({ action, birthday, today, terms });
  }
  if (action.trigger_type === 'school_year') {
    return isSchoolYearActionDue({ action, birthday, today });
  }
  return false;
}

function canGenerate(action: ActionLibraryRecord): boolean {
  return action.active && !action.needs_verification;
}

export function materializeActionHolds(params: {
  actions?: ActionLibraryRecord[];
  children: ActionChild[];
  items: LinkedActionItem[];
  facts: FamilyFact[];
  events?: CalendarOccurrence[];
  terms?: TermDateRecord[];
  today: string;
}): ActionHoldDraft[] {
  const actions = params.actions ?? ACTION_LIBRARY_SEED;
  const terms = params.terms?.length ? params.terms : ENGLAND_TERM_DATES_SEED;
  const drafts: ActionHoldDraft[] = [];
  for (const child of params.children) {
    if ((child.role || 'child').toLowerCase() !== 'child') continue;
    if (!child.first_name.trim() || !child.birthday) continue;
    const age = ageFromBirthday(child.birthday, params.today);
    for (const action of actions) {
      if (!canGenerate(action)) continue;
      if (!actionIsDue({ action, birthday: child.birthday, today: params.today, terms })) continue;
      if (hasLinkedActionItem(params.items, action.id, child.first_name)) continue;
      const state = resolveActionState({
        action,
        child,
        facts: params.facts,
        events: params.events ?? [],
        today: params.today,
      });
      if (state === 'completed') continue;
      const copy = userFacingActionCopy(action, child.first_name, age);
      drafts.push({
        title: copy.title,
        body: copy.body,
        action_description: copy.action_description,
        kind: 'hold',
        source: 'action_library',
        source_label: action.source,
        action_library_id: action.id,
        who_it_affects: child.first_name,
        status: 'open',
        due_at: null,
        category: actionItemCategory(action.category),
        confidence: 'medium',
      });
    }
  }
  return drafts;
}

export function actionHoldAsPlacementItem(draft: ActionHoldDraft, id = 'action-hold'): PlacementItem {
  return {
    id,
    title: draft.title,
    kind: draft.kind,
    status: draft.status,
    due_at: draft.due_at,
  };
}

export function actionHoldIsRadarWatch(draft: ActionHoldDraft, today = new Date()): boolean {
  return isRadarWatchItem(actionHoldAsPlacementItem(draft), today);
}

export function noticedActionCandidates(params: {
  actions?: ActionLibraryRecord[];
  children: ActionChild[];
  today: string;
}): { childName: string; action: ActionLibraryRecord; age: ChildAge | null }[] {
  const actions = params.actions ?? ACTION_LIBRARY_SEED;
  const out: { childName: string; action: ActionLibraryRecord; age: ChildAge | null }[] = [];
  for (const child of params.children) {
    if ((child.role || 'child').toLowerCase() !== 'child') continue;
    const age = ageFromBirthday(child.birthday, params.today);
    for (const action of actions) {
      if (!canGenerate(action)) continue;
      if (!actionIsDue({ action, birthday: child.birthday, today: params.today })) continue;
      out.push({ childName: child.first_name, action, age });
    }
  }
  return out;
}

export function childcareDeadlineFromTerms(params: {
  birthday: string;
  today: string;
  minAgeMonths: number;
  terms: TermDateRecord[];
  jurisdiction?: string;
}): string | null {
  const dob = parseYmd(params.birthday);
  const today = parseYmd(params.today);
  if (!dob || !today) return null;
  const eligibleFrom = addCalendarMonthsYmd(dob, params.minAgeMonths);
  const eligibleMs = ymdToUtcDate(eligibleFrom).getTime();
  const todayMs = ymdToUtcDate(today).getTime();
  const jurisdiction = params.jurisdiction ?? 'England';

  const eligible = params.terms
    .filter((term) => term.jurisdiction === jurisdiction)
    .filter((term) => {
      const start = parseYmd(term.term_start_date);
      if (!start) return false;
      if (ymdToUtcDate(start).getTime() < eligibleMs) return false;
      const from = parseYmd(term.effective_from);
      const to = parseYmd(term.effective_to);
      if (from && ymdToUtcDate(from).getTime() > todayMs) return false;
      if (to && ymdToUtcDate(to).getTime() < todayMs) return false;
      return true;
    })
    .sort((a, b) => a.term_start_date.localeCompare(b.term_start_date));

  const upcoming = eligible.find((term) => {
    const deadline = parseYmd(term.application_deadline || term.term_start_date);
    return deadline && ymdToUtcDate(deadline).getTime() >= todayMs;
  });
  return upcoming?.application_deadline ?? eligible[0]?.application_deadline ?? null;
}

export function confirmActionLibraryCompletion(params: {
  store: FamilyFactsStore;
  actionId: string;
  actionName: string;
  personId: string | null;
  userId: string;
  householdId?: string | null;
  now?: string;
  id?: string;
}): FamilyFact {
  const key = completionEvidenceKey(params.actionId);
  const existing = params.store.facts.find(
    (row) => row.evidence_key === key && (row.person_id ?? null) === (params.personId ?? null),
  );
  const now = params.now ?? new Date().toISOString();
  if (existing) {
    existing.status = 'active';
    existing.source = 'user_confirmation';
    existing.last_confirmed = now;
    existing.confidence = 'high';
    return existing;
  }
  const fact = insertManualFact(
    params.store,
    {
      person_id: params.personId,
      fact_type: 'person_attribute',
      content: `${params.actionName} completed`,
    },
    {
      user_id: params.userId,
      household_id: params.householdId ?? null,
      now,
      id: params.id,
    },
  );
  fact.source = 'user_confirmation';
  fact.evidence_key = key;
  fact.evidence = `user_confirmation:${params.actionId}`;
  return fact;
}

export function emptyActionFactsStore(): FamilyFactsStore {
  return emptyFactsStore();
}

type LooseClient = {
  from: (table: string) => any;
};

export async function persistActionHolds(
  db: LooseClient,
  params: {
    userId: string;
    householdId: string | null;
    visibility: string;
    drafts: ActionHoldDraft[];
  },
): Promise<number> {
  if (!params.drafts.length) return 0;
  const { error } = await db.from('items').insert(
    params.drafts.map((draft) => ({
      user_id: params.userId,
      household_id: params.householdId,
      created_by: params.userId,
      visibility: params.visibility,
      title: draft.title,
      body: draft.body,
      detail: draft.body,
      action_description: draft.action_description,
      kind: draft.kind,
      source: draft.source,
      source_label: draft.source_label,
      action_library_id: draft.action_library_id,
      who_it_affects: draft.who_it_affects,
      status: draft.status,
      due_at: draft.due_at,
      category: draft.category,
      confidence: draft.confidence,
    })),
  );
  if (error) {
    console.error('Failed to insert action library items:', error.message);
    return 0;
  }
  return params.drafts.length;
}

export { ageFromBirthday, formatYmd };
