import { supabase } from '@/lib/supabase';

export type UserType = 'solo' | 'partner' | 'family' | 'expecting';

export type SignupStep =
  | 'account'
  | 'name'
  | 'type'
  | 'kids'
  | 'partner'
  | 'connect'
  | 'extra'
  | 'summary';

export const SIGNUP_STEPS_START: SignupStep[] = ['account', 'name', 'type'];

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
  email: string;
  password: string;
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
  email: '',
  password: '',
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

export function validEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
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
    return { title: 'MOT', day: day || 'Soon', month, isDay, sub };
  }
  if (t.includes('birthday')) {
    const nm = txt.match(/(\w+)'s birthday/i)?.[1] || 'Birthday';
    return { title: `${nm}'s birthday`, day, month, isDay, sub };
  }
  if (t.includes('party')) {
    const nm = txt.match(/(\w+)'s party/i)?.[1] || 'Party';
    return { title: `${nm}'s party`, day, month, isDay, sub };
  }
  if (t.includes('holiday') || t.includes('going to') || t.match(/fly|travel|lanzarote/)) {
    const d = txt.match(/(?:to|going to)\s+([A-Z][a-z]+)/i)?.[1] || 'Holiday';
    return { title: d, day, month, isDay, sub };
  }
  return {
    title: txt.split(' ').slice(0, 5).join(' '),
    day,
    month,
    isDay,
    sub,
  };
}

export type CompleteSignupResult = { ok: true } | { ok: false; message: string };

const EMAIL_IN_USE = 'That email is already in use. Try signing in, or use a different email.';
const CONFIRM_EMAIL =
  'Account created, but you need to confirm your email before we can finish setup. Check your inbox, then try again.';

function isEmailTakenMessage(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.includes('user already exists') ||
    m.includes('email address is already')
  );
}

function friendlyAuthMessage(message: string) {
  if (isEmailTakenMessage(message) || message.toLowerCase().includes('invalid login credentials')) {
    return EMAIL_IN_USE;
  }
  if (message.toLowerCase().includes('email not confirmed')) {
    return CONFIRM_EMAIL;
  }
  return message || 'Something went wrong. Please try again.';
}

async function signInExisting(
  email: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, message: friendlyAuthMessage(error?.message || EMAIL_IN_USE) };
  }
  return { ok: true, userId: data.user.id };
}

type FamilyMemberInsert = {
  user_id: string;
  role: 'child' | 'partner';
  first_name: string;
  last_name?: string | null;
  birthday?: string | null;
  school?: string | null;
  invited?: boolean;
};

export async function completeSignup(state: SignupState): Promise<CompleteSignupResult> {
  try {
    const email = state.email.trim();
    const password = state.password;
    const first_name = state.name.trim();
    const last_name = state.lastName.trim();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name, last_name } },
  });

  const duplicateIdentities = (signUpData.user?.identities?.length ?? 1) === 0;
  let userId: string | undefined;

  if (signUpError) {
    if (!isEmailTakenMessage(signUpError.message)) {
      return { ok: false, message: friendlyAuthMessage(signUpError.message) };
    }
    const existing = await signInExisting(email, password);
    if (!existing.ok) return existing;
    userId = existing.userId;
  } else if (duplicateIdentities) {
    const existing = await signInExisting(email, password);
    if (!existing.ok) return { ok: false, message: EMAIL_IN_USE };
    userId = existing.userId;
  } else if (!signUpData.user) {
    return { ok: false, message: 'Could not create your account. Please try again.' };
  } else if (!signUpData.session) {
    return { ok: false, message: CONFIRM_EMAIL };
  } else {
    userId = signUpData.user.id;
  }

  if (!userId) {
    return { ok: false, message: 'Could not create your account. Please try again.' };
  }

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    first_name,
    last_name,
    family_setup_type: state.userType,
    onboarding_completed_at: new Date().toISOString(),
  });

  if (profileError) {
    return { ok: false, message: profileError.message };
  }

  const members: FamilyMemberInsert[] = [];

  for (const kid of state.kids) {
    const name = kid.name.trim();
    if (!name) continue;
    members.push({
      user_id: userId,
      role: 'child',
      first_name: name,
      birthday: kid.birthday.trim() || null,
      school: kid.school.trim() || null,
    });
  }

  const partnerName = state.partner.trim();
  if (partnerName) {
    members.push({
      user_id: userId,
      role: 'partner',
      first_name: partnerName,
      invited: state.partnerInvited,
    });
  }

  if (members.length) {
    await supabase.from('family_members').delete().eq('user_id', userId);
    const { error: membersError } = await supabase.from('family_members').insert(members);
    if (membersError) {
      return { ok: false, message: membersError.message };
    }
  }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
    return { ok: false, message };
  }
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
