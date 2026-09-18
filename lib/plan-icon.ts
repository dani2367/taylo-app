export type IconName = string;
export type Wash = 'blush' | 'sage' | 'paleBlue';

export type PlanIconSpec = {
  name: IconName;
  wash: Wash;
};

/** Same pastels as `constants/theme` — kept local so icon matching can be tested without RN. */
export const washColor: Record<Wash, string> = {
  blush: '#F2DED8',
  sage: '#DDE8E2',
  paleBlue: '#DCE7ED',
};

const DOC: PlanIconSpec = { name: 'document-text-outline', wash: 'sage' };
const SCHOOL: PlanIconSpec = { name: 'school-outline', wash: 'sage' };
const HEART: PlanIconSpec = { name: 'heart-outline', wash: 'blush' };
const GIFT: PlanIconSpec = { name: 'gift-outline', wash: 'blush' };
const SPORT: PlanIconSpec = { name: 'fitness-outline', wash: 'blush' };
const BIKE: PlanIconSpec = { name: 'bicycle-outline', wash: 'blush' };
const WATER: PlanIconSpec = { name: 'water-outline', wash: 'paleBlue' };
const SPA: PlanIconSpec = { name: 'flower-outline', wash: 'blush' };
const CALENDAR: PlanIconSpec = { name: 'calendar-outline', wash: 'blush' };
const MEDKIT: PlanIconSpec = { name: 'medkit-outline', wash: 'paleBlue' };
const PLANE: PlanIconSpec = { name: 'airplane-outline', wash: 'paleBlue' };
const CART: PlanIconSpec = { name: 'cart-outline', wash: 'paleBlue' };
const HOME: PlanIconSpec = { name: 'home-outline', wash: 'blush' };
const CARD: PlanIconSpec = { name: 'card-outline', wash: 'paleBlue' };
const CALL: PlanIconSpec = { name: 'call-outline', wash: 'paleBlue' };
const TICKET: PlanIconSpec = { name: 'ticket-outline', wash: 'blush' };
const CAMERA: PlanIconSpec = { name: 'camera-outline', wash: 'sage' };
const CUT: PlanIconSpec = { name: 'cut-outline', wash: 'blush' };
const BED: PlanIconSpec = { name: 'bed-outline', wash: 'paleBlue' };
const PEOPLE: PlanIconSpec = { name: 'people-outline', wash: 'paleBlue' };
const CHECK: PlanIconSpec = { name: 'checkbox-outline', wash: 'sage' };
const LIST: PlanIconSpec = { name: 'list-outline', wash: 'sage' };
const CUBE: PlanIconSpec = { name: 'cube-outline', wash: 'paleBlue' };
const SWAP: PlanIconSpec = { name: 'swap-horizontal-outline', wash: 'paleBlue' };
const BOOKMARK: PlanIconSpec = { name: 'bookmark-outline', wash: 'blush' };
const WRENCH: PlanIconSpec = { name: 'construct-outline', wash: 'paleBlue' };

const EMOJI_TO_ICON: Record<string, PlanIconSpec> = {
  '🛒': CART,
  '✈️': PLANE,
  '🎂': GIFT,
  '🎁': GIFT,
  '🎉': GIFT,
  '🎊': GIFT,
  '🥂': HEART,
  '💍': HEART,
  '👰': HEART,
  '🎟️': TICKET,
  '🎭': TICKET,
  '🦷': MEDKIT,
  '🏥': MEDKIT,
  '💊': MEDKIT,
  '📞': CALL,
  '📝': DOC,
  '🏫': SCHOOL,
  '📚': SCHOOL,
  '💳': CARD,
  '🏠': HOME,
  '📦': CUBE,
  '↩️': SWAP,
  '📷': CAMERA,
  '🧷': CART,
  '📌': BOOKMARK,
  '🔧': WRENCH,
  '⚽': SPORT,
  '🏊': WATER,
  '🏃': SPORT,
  '🚴': BIKE,
  '💐': SPA,
  '🌸': SPA,
};

const CATEGORY_ICON: Record<string, PlanIconSpec> = {
  school: SCHOOL,
  medical: MEDKIT,
  activity: CALENDAR,
  delivery: CUBE,
  returns: SWAP,
  financial: CARD,
  errand: CART,
  home: HOME,
};

/** Category glyphs written at ingest — never treat them as a chosen icon. */
const GENERIC_STORED = new Set([
  'bicycle-outline',
  'school-outline',
  'medkit-outline',
  'cube-outline',
  'swap-horizontal-outline',
  'card-outline',
  'cart-outline',
  'home-outline',
  'gift-outline',
  'calendar-outline',
  'bookmark-outline',
  'fitness-outline',
]);

export function resolvePlanIcon(opts: {
  title?: string | null;
  category?: string | null;
  collectionType?: string | null;
  stored?: string | null;
}): PlanIconSpec {
  if (opts.collectionType === 'shopping') return CART;
  if (opts.collectionType === 'todo' || opts.title === 'General to do') return CHECK;
  if (opts.collectionType === 'trip') return PLANE;
  if (opts.collectionType === 'custom' || opts.collectionType === 'other') {
    const customStored = (opts.stored || '').trim();
    const fromEmoji = iconFromStored(customStored);
    if (fromEmoji) return fromEmoji;
    if (!customStored) return LIST;
  }

  const fromTitle = iconFromTitle(opts.title);
  if (fromTitle) return fromTitle;

  const stored = iconFromStored((opts.stored || '').trim());
  if (stored) return stored;

  const category = (opts.category || '').toLowerCase();
  if (CATEGORY_ICON[category]) return CATEGORY_ICON[category];

  return BOOKMARK;
}

function iconFromStored(stored: string): PlanIconSpec | null {
  if (!stored) return null;
  if (EMOJI_TO_ICON[stored]) return EMOJI_TO_ICON[stored];
  if (EMOJI_TO_ICON[stored.slice(0, 2)]) return EMOJI_TO_ICON[stored.slice(0, 2)];
  if (!stored.includes('-')) return null;
  if (GENERIC_STORED.has(stored)) return null;
  return { name: stored as IconName, wash: washForStored(stored) };
}

function iconFromTitle(raw?: string | null): PlanIconSpec | null {
  const title = (raw || '').toLowerCase().replace(/['’]/g, "'");
  if (!title.trim()) return null;

  if (isPaperwork(title)) return DOC;
  if (isWedding(title)) return HEART;
  if (isSchoolReception(title)) return SCHOOL;
  if (isBirthdayOrGift(title)) return GIFT;
  if (/\b(spa|massage|sauna|wellness|facial|manicure|pedicure)\b/.test(title)) return SPA;
  if (/\b(haircut|hair cut|hairdresser|barber|blow-?dry)\b/.test(title)) return CUT;
  if (/\b(dentist|dental|teeth|orthodont|gp|nhs|doctor|hospital|pharmacy|optician|eye test|immunis|vaccin|pre-?op|operation|surgery)\b/.test(title)) {
    return MEDKIT;
  }
  if (/\b(hotel|accommodation|airbnb|b&b)\b/.test(title)) return BED;
  if (/\b(flight|holiday|holidays|travel|passport|suitcase|airport)\b/.test(title) || /\btrip\b/.test(title)) {
    return PLANE;
  }
  if (isSport(title)) return sportIcon(title);
  if (/\b(ticket|tickets|panto|theatre|theater|cinema|concert|show)\b/.test(title)) return TICKET;
  if (/\b(call|phone|ring back|phone call)\b/.test(title)) return CALL;
  if (/\b(photo|camera)\b/.test(title)) return CAMERA;
  if (isSchool(title)) return SCHOOL;
  if (/\b(bill|invoice|payment|council tax|rent|mortgage)\b/.test(title) || /\bpay\b/.test(title)) return CARD;
  if (/\b(shop|shopping|grocery|groceries|tesco|sainsbury|waitrose|asda|aldi|lidl)\b/.test(title)) return CART;
  if (/\b(buy|order|pick up|collect)\b/.test(title)) return CART;
  if (/\b(laundry|bins|dishwasher|garden|boiler|clean)\b/.test(title)) return HOME;
  if (/\b(meeting|1:1|one to one|standup|playdate|catch[- ]up)\b/.test(title)) return PEOPLE;
  if (/\b(party|celebration|anniversary)\b/.test(title)) return GIFT;
  return null;
}

function isPaperwork(title: string): boolean {
  if (/\b(application|enrol|enroll|admission|ofsted|paperwork|rsvp|permission|consent)\b/.test(title)) {
    return true;
  }
  if (/\b(form|forms)\b/.test(title) && !/\buniform\b/.test(title)) return true;
  if (/\b(speech|chairman)\b/.test(title)) return true;
  return false;
}

/** The day someone gets married — not a present, not school reception. */
function isWedding(title: string): boolean {
  if (!/\b(wedding|hen do|stag do|civil ceremony)\b/.test(title)) return false;
  if (/\b(buy|order|shop|shoes|present|gift|card)\b/.test(title)) return false;
  return true;
}

function isSchoolReception(title: string): boolean {
  if (/\bwedding\b/.test(title)) return false;
  if (!/\breception\b/.test(title)) return false;
  return /\b(application|class|place|places|year|school|nursery|primary|start|starting|offer|admissions?)\b/.test(
    title,
  );
}

function isBirthdayOrGift(title: string): boolean {
  if (/\b(birthday|bday)\b/.test(title)) return true;
  if (/\b(present|gift)\b/.test(title) && !/\bpermission\b/.test(title)) return true;
  if (/\b(birthday card|party card|thank[-\s]?you card)\b/.test(title)) return true;
  if (/\b(buy|get|order)\s+(a\s+)?card\b/.test(title)) return true;
  return false;
}

function isSport(title: string): boolean {
  return /\b(swim|swimming|gala|football|rugby|tennis|ballet|dance|bike|cycle|cycling|training|match|pe\b|sports? day|athletics|gym|yoga|pilates)\b/.test(
    title,
  );
}

function sportIcon(title: string): PlanIconSpec {
  if (/\b(bike|cycle|cycling)\b/.test(title)) return BIKE;
  if (/\b(swim|swimming)\b/.test(title)) return WATER;
  return SPORT;
}

function isSchool(title: string): boolean {
  return /\b(school|teacher|nursery|homework|uniform|pe kit|parents'? evening|inset|nativity|assembly|ofsted)\b/.test(
    title,
  );
}

function washForStored(name: string): Wash {
  if (name.includes('school') || name.includes('camera') || name.includes('document')) return 'sage';
  if (name.includes('gift') || name.includes('home') || name.includes('heart') || name.includes('flower')) {
    return 'blush';
  }
  return 'paleBlue';
}
