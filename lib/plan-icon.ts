import { colors } from '@/constants/theme';
import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export type Wash = 'blush' | 'sage' | 'paleBlue';

export type PlanIconSpec = {
  name: IconName;
  wash: Wash;
};

export const washColor: Record<Wash, string> = {
  blush: colors.blush,
  sage: colors.sage,
  paleBlue: colors.paleBlue,
};

const EMOJI_TO_ICON: Record<string, PlanIconSpec> = {
  '🛒': { name: 'cart-outline', wash: 'paleBlue' },
  '✈️': { name: 'airplane-outline', wash: 'paleBlue' },
  '🎂': { name: 'gift-outline', wash: 'blush' },
  '🎁': { name: 'gift-outline', wash: 'blush' },
  '🎉': { name: 'gift-outline', wash: 'blush' },
  '🎟️': { name: 'ticket-outline', wash: 'blush' },
  '🦷': { name: 'medkit-outline', wash: 'paleBlue' },
  '📞': { name: 'call-outline', wash: 'paleBlue' },
  '📝': { name: 'document-text-outline', wash: 'sage' },
  '🏫': { name: 'school-outline', wash: 'sage' },
  '📚': { name: 'school-outline', wash: 'sage' },
  '💳': { name: 'card-outline', wash: 'paleBlue' },
  '🏠': { name: 'home-outline', wash: 'blush' },
  '📦': { name: 'cube-outline', wash: 'paleBlue' },
  '↩️': { name: 'swap-horizontal-outline', wash: 'paleBlue' },
  '🏥': { name: 'medkit-outline', wash: 'paleBlue' },
  '🎭': { name: 'bicycle-outline', wash: 'blush' },
  '📷': { name: 'camera-outline', wash: 'sage' },
  '🧷': { name: 'cart-outline', wash: 'paleBlue' },
  '📌': { name: 'bookmark-outline', wash: 'blush' },
  '🔧': { name: 'construct-outline', wash: 'paleBlue' },
};

const CATEGORY_ICON: Record<string, PlanIconSpec> = {
  school: { name: 'school-outline', wash: 'sage' },
  medical: { name: 'medkit-outline', wash: 'paleBlue' },
  activity: { name: 'bicycle-outline', wash: 'blush' },
  delivery: { name: 'cube-outline', wash: 'paleBlue' },
  returns: { name: 'swap-horizontal-outline', wash: 'paleBlue' },
  financial: { name: 'card-outline', wash: 'paleBlue' },
  errand: { name: 'cart-outline', wash: 'paleBlue' },
  home: { name: 'home-outline', wash: 'blush' },
};

const DEFAULT_ICON: PlanIconSpec = { name: 'bookmark-outline', wash: 'blush' };

export function resolvePlanIcon(opts: {
  title?: string | null;
  category?: string | null;
  collectionType?: string | null;
  stored?: string | null;
}): PlanIconSpec {
  if (opts.collectionType === 'shopping') return { name: 'cart-outline', wash: 'paleBlue' };
  if (opts.collectionType === 'trip') return { name: 'airplane-outline', wash: 'paleBlue' };

  const stored = (opts.stored || '').trim();
  if (stored && EMOJI_TO_ICON[stored]) return EMOJI_TO_ICON[stored];
  if (stored && stored.includes('-')) {
    return { name: stored as IconName, wash: washForStored(stored, opts.category) };
  }

  const blob = `${opts.title || ''} ${opts.category || ''}`.toLowerCase();

  if (/\b(birthday|bday)\b/.test(blob)) return { name: 'gift-outline', wash: 'blush' };
  if (/\b(present|gift|card)\b/.test(blob) && !/\bpermission\b/.test(blob)) {
    return { name: 'gift-outline', wash: 'blush' };
  }
  if (/\b(ticket|tickets|panto)\b/.test(blob)) return { name: 'ticket-outline', wash: 'blush' };
  if (/\b(dentist|dental|teeth|orthodont|gp|nhs|doctor|hospital|pharmacy)\b/.test(blob)) {
    return { name: 'medkit-outline', wash: 'paleBlue' };
  }
  if (/\b(flight|holiday|travel|trip|passport|suitcase)\b/.test(blob)) {
    return { name: 'airplane-outline', wash: 'paleBlue' };
  }
  if (/\b(call|phone|ring)\b/.test(blob)) return { name: 'call-outline', wash: 'paleBlue' };
  if (/\b(permission|ofsted|admin|form|paperwork)\b/.test(blob)) {
    return { name: 'document-text-outline', wash: 'sage' };
  }
  if (/\b(photo|camera)\b/.test(blob)) return { name: 'camera-outline', wash: 'sage' };
  if (/\b(school|teacher|nursery|homework|uniform|pe kit)\b/.test(blob)) {
    return { name: 'school-outline', wash: 'sage' };
  }
  if (/\b(bill|invoice|pay|payment|council tax|rent|mortgage)\b/.test(blob)) {
    return { name: 'card-outline', wash: 'paleBlue' };
  }
  if (/\b(shop|shopping|grocery|groceries|tesco|sainsbury|waitrose|asda|aldi|lidl)\b/.test(blob)) {
    return { name: 'cart-outline', wash: 'paleBlue' };
  }
  if (/\b(home|laundry|bins|dishwasher|garden|boiler|clean)\b/.test(blob)) {
    return { name: 'home-outline', wash: 'blush' };
  }
  if (opts.collectionType === 'event') return { name: 'gift-outline', wash: 'blush' };

  const category = (opts.category || '').toLowerCase();
  if (CATEGORY_ICON[category]) return CATEGORY_ICON[category];

  if (stored && EMOJI_TO_ICON[stored.slice(0, 2)]) return EMOJI_TO_ICON[stored.slice(0, 2)];
  return DEFAULT_ICON;
}

function washForStored(name: string, category?: string | null): Wash {
  if (category && CATEGORY_ICON[category.toLowerCase()]) return CATEGORY_ICON[category.toLowerCase()].wash;
  if (name.includes('school') || name.includes('camera') || name.includes('document')) return 'sage';
  if (name.includes('gift') || name.includes('home') || name.includes('bicycle')) return 'blush';
  return 'paleBlue';
}
