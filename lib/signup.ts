export type UserType = 'solo' | 'partner' | 'family' | 'expecting';

export type SignupStep =
  | 'name'
  | 'type'
  | 'kids'
  | 'partner'
  | 'connect'
  | 'extra'
  | 'summary';

export type Kid = {
  name: string;
  birthday: string;
  age: number | null;
  school: string;
};

export type ExtraItem = {
  title: string;
  day: string;
  month: string;
  isDay: boolean;
  sub: string;
};

export type SignupState = {
  name: string;
  lastName: string;
  kids: Kid[];
  partner: string;
  partnerInvited: boolean;
  userType: UserType;
  extras: ExtraItem[];
  connections: Record<string, boolean>;
};

export const emptyKid = (): Kid => ({ name: '', birthday: '', age: null, school: '' });

export const initialSignupState = (): SignupState => ({
  name: '',
  lastName: '',
  kids: [emptyKid()],
  partner: '',
  partnerInvited: false,
  userType: 'family',
  extras: [],
  connections: {},
});

export function cap(s: string) {
  const t = (s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

export function expandSteps(userType: UserType, currentIndex: number, steps: SignupStep[]): SignupStep[] {
  const rest: SignupStep[] = [];
  if (userType === 'family') rest.push('kids');
  if (userType !== 'solo') rest.push('partner');
  rest.push('connect', 'extra', 'summary');
  return steps.slice(0, currentIndex + 1).concat(rest);
}

export function parseExtra(txt: string): ExtraItem {
  const t = txt.toLowerCase();
  const ds = extractDateString(txt);
  const day = ds?.day || '';
  const month = ds?.month || '';
  const isDay = ds?.isDay || false;
  const sub = 'Added during setup';

  if (t.includes('mot')) {
    return { title: '🔧 MOT', day: day || 'Soon', month, isDay, sub };
  }
  if (t.includes('birthday')) {
    const nm = txt.match(/(\w+)'s birthday/i)?.[1] || 'Birthday';
    return { title: `🎂 ${nm}'s birthday`, day, month, isDay, sub };
  }
  if (t.includes('party')) {
    const nm = txt.match(/(\w+)'s party/i)?.[1] || 'Party';
    return { title: `🎉 ${nm}'s party`, day, month, isDay, sub };
  }
  if (t.includes('holiday') || t.includes('going to') || t.match(/fly|travel|lanzarote/)) {
    const d = txt.match(/(?:to|going to)\s+([A-Z][a-z]+)/i)?.[1] || 'Holiday';
    return { title: `✈️ ${d}`, day, month, isDay, sub };
  }
  return {
    title: `📌 ${txt.split(' ').slice(0, 5).join(' ')}`,
    day,
    month,
    isDay,
    sub,
  };
}

export function extraChipLabel(title: string) {
  return title.replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}️‍]/gu, '').trim();
}

type DateBits = { day: string; month: string; isDay: boolean; resolved: boolean };

export function extractDateString(txt: string): DateBits | null {
  return resolveRelativeDate(txt);
}

function resolveRelativeDate(txt: string): DateBits | null {
  const t = txt.toLowerCase();
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const nextDay = t.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  const thisDay = t.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  const dayMatch = nextDay || thisDay;
  if (dayMatch) {
    const target = dayNames.indexOf(dayMatch[1].toLowerCase());
    const d = new Date(now);
    let diff = target - d.getDay();
    if (diff <= 0 || nextDay) diff += 7;
    d.setDate(d.getDate() + diff);
    return { day: String(d.getDate()), month: shortMonths[d.getMonth()], isDay: false, resolved: true };
  }

  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  for (let i = 0; i < months.length; i++) {
    if (t.includes(months[i])) {
      const dm = txt.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
      return { day: dm ? dm[1] : '', month: shortMonths[i], isDay: false, resolved: false };
    }
  }

  if (t.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return { day: String(d.getDate()), month: shortMonths[d.getMonth()], isDay: false, resolved: true };
  }

  return null;
}
