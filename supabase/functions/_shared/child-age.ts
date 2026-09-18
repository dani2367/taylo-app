export type WindowUnit = 'hours' | 'days' | 'weeks' | 'months';

export type Ymd = { y: number; m: number; d: number };

export type ChildAge = {
  days: number;
  weeks: number;
  months: number;
  hours: number;
  years: number;
  label: string;
};

export function parseYmd(value: string | null | undefined): Ymd | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function ymdToUtcDate(ymd: Ymd): Date {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
}

export function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetweenYmd(from: Ymd, to: Ymd): number {
  const ms = ymdToUtcDate(to).getTime() - ymdToUtcDate(from).getTime();
  return Math.floor(ms / 86400000);
}

export function addDaysYmd(ymd: Ymd, days: number): Ymd {
  const date = ymdToUtcDate(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return parseYmd(formatYmd(date))!;
}

export function addCalendarMonthsYmd(ymd: Ymd, months: number): Ymd {
  const date = ymdToUtcDate(ymd);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return parseYmd(formatYmd(date))!;
}

export function addWindowUnit(ymd: Ymd, amount: number, unit: WindowUnit): Ymd {
  if (unit === 'hours') return addDaysYmd(ymd, amount / 24);
  if (unit === 'days') return addDaysYmd(ymd, amount);
  if (unit === 'weeks') return addDaysYmd(ymd, amount * 7);
  return addCalendarMonthsYmd(ymd, amount);
}

export function ageFromBirthday(birthday: string | null, todayIso: string): ChildAge | null {
  const born = parseYmd(birthday);
  const today = parseYmd(todayIso);
  if (!born || !today) return null;
  const days = daysBetweenYmd(born, today);
  if (days < 0) return null;

  let years = today.y - born.y;
  let months = today.m - born.m;
  if (today.d < born.d) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalMonths = years * 12 + months;
  if (totalMonths < 0) return null;

  let label: string;
  if (totalMonths < 24) {
    label = totalMonths === 1 ? '1 month' : `${totalMonths} months`;
  } else if (years < 8) {
    label = months === 0 ? `${years} years` : `${years} years ${months} months`;
  } else {
    label = `${years} years`;
  }

  return {
    days,
    weeks: Math.floor(days / 7),
    months: totalMonths,
    hours: days * 24,
    years,
    label,
  };
}
