import {
  addCalendarMonthsYmd,
  addDaysYmd,
  formatYmd,
  parseYmd,
  ymdToUtcDate,
} from './child-age.ts';

export type AdminTermDate = {
  id: string;
  term_name: string;
  term_start_date: string;
  application_deadline: string | null;
  effective_from: string | null;
  effective_to: string | null;
  jurisdiction: string;
};

export type AdminActionRef = {
  id: string;
  jurisdiction: string;
  window_start: number | null;
  lead_window_days: number;
};

/** GOV.UK funded-childcare terms: 1 Jan / 1 Apr / 1 Sep. Deadlines are the day before. */
export function englandFundedChildcareTerms(fromYear = 2025, toYear = 2031): AdminTermDate[] {
  const rows: AdminTermDate[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    rows.push(
      term('england-childcare-spring-' + year, `Spring ${year}`, `${year}-01-01`, `${year - 1}-12-31`),
      term('england-childcare-summer-' + year, `Summer ${year}`, `${year}-04-01`, `${year}-03-31`),
      term('england-childcare-autumn-' + year, `Autumn ${year}`, `${year}-09-01`, `${year}-08-31`),
    );
  }
  return rows;
}

function term(id: string, name: string, start: string, deadline: string): AdminTermDate {
  const year = Number(start.slice(0, 4));
  return {
    id,
    term_name: name,
    term_start_date: start,
    application_deadline: deadline,
    effective_from: `${year - 1}-01-01`,
    effective_to: `${year + 1}-12-31`,
    jurisdiction: 'England',
  };
}

export function firstFundedChildcareTerm(params: {
  birthday: string;
  minAgeMonths: number;
  terms: AdminTermDate[];
  jurisdiction?: string;
}): AdminTermDate | null {
  const dob = parseYmd(params.birthday);
  if (!dob) return null;
  const eligibleFrom = addCalendarMonthsYmd(dob, params.minAgeMonths);
  const eligibleMs = ymdToUtcDate(eligibleFrom).getTime();
  const jurisdiction = params.jurisdiction ?? 'England';
  return (
    params.terms
      .filter((row) => row.jurisdiction === jurisdiction)
      .filter((row) => {
        const start = parseYmd(row.term_start_date);
        return !!start && ymdToUtcDate(start).getTime() >= eligibleMs;
      })
      .sort((a, b) => a.term_start_date.localeCompare(b.term_start_date))[0] ?? null
  );
}

/** Reception: born 1 Sep Y–31 Aug Y+1 start school Sep Y+5. */
export function receptionStartYear(birthday: string): number | null {
  const dob = parseYmd(birthday);
  if (!dob) return null;
  return dob.m > 8 ? dob.y + 5 : dob.y + 4;
}

export function year7StartYear(birthday: string): number | null {
  const start = receptionStartYear(birthday);
  return start == null ? null : start + 7;
}

export function nextWorkingDay(iso: string): string {
  const ymd = parseYmd(iso);
  if (!ymd) return iso;
  const date = ymdToUtcDate(ymd);
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return formatYmd(date);
}

function inInclusiveRange(today: string, from: string, until: string): boolean {
  return today >= from && today <= until;
}

function leadStart(iso: string, leadDays: number): string {
  const ymd = parseYmd(iso);
  if (!ymd) return iso;
  return formatYmd(ymdToUtcDate(addDaysYmd(ymd, -leadDays)));
}

/**
 * 30 hours: apply from 23 weeks old until the deadline of the first eligible term.
 * https://www.gov.uk/free-childcare-if-working/when-to-apply
 * 15 hours: product lead before the first term after the third birthday, until that term starts.
 */
export function isChildcareActionDue(params: {
  action: AdminActionRef;
  birthday: string;
  today: string;
  terms: AdminTermDate[];
}): boolean {
  const minAge = params.action.window_start;
  if (minAge == null) return false;
  const first = firstFundedChildcareTerm({
    birthday: params.birthday,
    minAgeMonths: minAge,
    terms: params.terms,
    jurisdiction: params.action.jurisdiction,
  });
  if (!first) return false;
  const dob = parseYmd(params.birthday);
  if (!dob) return false;

  if (params.action.id === 'childcare-30-hours-from-9-months') {
    const applyFrom = formatYmd(ymdToUtcDate(addDaysYmd(dob, 23 * 7)));
    const deadline = first.application_deadline || first.term_start_date;
    return inInclusiveRange(params.today, applyFrom, deadline);
  }

  const termStart = first.term_start_date;
  return inInclusiveRange(params.today, leadStart(termStart, params.action.lead_window_days), termStart);
}

export function isSchoolYearActionDue(params: {
  action: AdminActionRef;
  birthday: string;
  today: string;
}): boolean {
  const startYear = params.action.id.startsWith('secondary-')
    ? year7StartYear(params.birthday)
    : receptionStartYear(params.birthday);
  if (startYear == null) return false;
  const applyYear = startYear - 1;
  const lead = params.action.lead_window_days;
  if (params.action.id === 'primary-school-application') {
    return inInclusiveRange(params.today, leadStart(`${applyYear}-09-01`, lead), `${startYear}-01-15`);
  }
  if (params.action.id === 'secondary-school-application') {
    return inInclusiveRange(params.today, leadStart(`${applyYear}-09-01`, lead), `${applyYear}-10-31`);
  }
  if (params.action.id === 'primary-school-offer-day') {
    const offer = nextWorkingDay(`${startYear}-04-16`);
    return inInclusiveRange(params.today, leadStart(offer, lead), offer);
  }
  if (params.action.id === 'secondary-school-offer-day') {
    const offer = nextWorkingDay(`${startYear}-03-01`);
    return inInclusiveRange(params.today, leadStart(offer, lead), offer);
  }
  return false;
}

export const GOVUK_ADMIN_VERIFIED_ON = '2026-09-17';
