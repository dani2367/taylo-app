export const demoFamily = {
  name: 'Sarah',
  lastName: 'Cohen',
  school: 'Akiva School',
  partner: 'James',
  partnerInvited: true,
  kids: [
    { name: 'Theo', age: 5, birthday: '', school: 'Akiva School' },
    { name: 'Lily', age: 2, birthday: '', school: 'Nursery' },
  ],
};

export type Chip = { label: string; msg: string };

export type NudgeAction = { t: string; cls: 'bd' | 'bg' | 'bdelegate' };

export type Nudge = {
  id: string;
  urgent: boolean;
  icon: string;
  cls: 'rose' | 'amber' | 'purple' | 'teal' | 'blue' | 'green';
  badge: string | null;
  title: string;
  src: string;
  body: string;
  opener: string;
  chips: Chip[];
  actions: NudgeAction[];
};

export type AheadItem = {
  id: string;
  day: string;
  month: string;
  title: string;
  sub: string;
  opener?: string;
  chips?: Chip[];
  emailCard?: boolean;
};

export type ChecklistItem = { text: string; when: string; done?: boolean };

export type Checklist = {
  id: string;
  headBg: 'rose' | 'blue' | 'amber';
  title: string;
  sub: string;
  items: ChecklistItem[];
};

const k0 = demoFamily.kids[0];
const k1 = demoFamily.kids[1];
const p = demoFamily.partner;
const s = demoFamily.school;

export const demoNudges: Nudge[] = [
  {
    id: 'mia-bday',
    urgent: true,
    icon: '🎂',
    cls: 'rose',
    badge: '3 days',
    title: "Mia's birthday is Saturday",
    src: '📅 From your calendar',
    body: 'Buying a gift? Here are some ideas under £20 with next-day delivery 🎁',
    opener:
      "Mia's birthday party is this Saturday — have you got a gift sorted yet? If not, I can suggest a few ideas under £20 with next-day delivery 🎁",
    chips: [
      { label: 'Gift ideas', msg: 'Give me gift ideas for Mia' },
      { label: 'Card message ideas', msg: 'Suggest a birthday card message' },
    ],
    actions: [
      { t: `→ ${p}`, cls: 'bdelegate' },
      { t: '✓ Done', cls: 'bd' },
    ],
  },
  {
    id: 'ns-panto',
    urgent: true,
    icon: '🎭',
    cls: 'amber',
    badge: 'Act soon',
    title: 'December panto — Early Bird tickets',
    src: '📧 Akiva newsletter · 5 Jun',
    body: 'School flagged an Early Bird deal at JW3. These go fast — worth grabbing before the deadline.',
    opener:
      'The Akiva newsletter flagged an Early Bird deal on December panto tickets at JW3 — these tend to sell out. Want the link, or shall I just remind you closer to the deadline?',
    chips: [
      { label: 'Send me the link', msg: 'Send me the panto ticket link' },
      { label: 'Remind me nearer the time', msg: 'Remind me about the panto tickets closer to the deadline' },
    ],
    actions: [
      { t: 'Not for us', cls: 'bg' },
      { t: '✓ Done', cls: 'bd' },
    ],
  },
  {
    id: 'ns-photo',
    urgent: true,
    icon: '📷',
    cls: 'rose',
    badge: null,
    title: 'Photo permissions — have you updated?',
    src: '📧 Akiva newsletter · 5 Jun',
    body: 'School asked parents to update this week. Takes 2 minutes — worth ticking off.',
    opener:
      "Akiva asked all parents to update photo permissions this week — it takes about 2 minutes. Want me to remind you at a specific time, or talk through what it's asking?",
    chips: [
      { label: 'Remind me tonight', msg: 'Remind me about photo permissions tonight' },
      { label: "What's it asking exactly?", msg: 'What does the photo permissions form ask?' },
    ],
    actions: [{ t: "✓ Done it", cls: 'bd' }],
  },
  {
    id: 'ns-essentials',
    urgent: false,
    icon: '🧷',
    cls: 'purple',
    badge: null,
    title: 'Essentials may be running low',
    src: '🛒 From Tesco emails',
    body: 'Nappies, 3+ toothpaste and Calpol based on your usual patterns. Thursday Tesco coming up.',
    opener:
      'Based on your usual Tesco order pattern, nappies, 3+ toothpaste and Calpol are probably getting low, and your usual Thursday shop is coming up. Want me to start a list?',
    chips: [
      { label: 'Start a shopping list', msg: 'Start a Tesco shopping list for essentials' },
      { label: "What's my usual order?", msg: 'What do I usually order from Tesco?' },
    ],
    actions: [{ t: '✓ Done', cls: 'bd' }],
  },
];

export const demoAhead: AheadItem[] = [
  {
    id: 'mia-bday',
    day: '7',
    month: 'Jun',
    title: "🎂 Mia's birthday party",
    sub: 'Buying a gift? Taylo has some ideas',
    opener:
      "Mia's birthday party is this Saturday — have you got a gift sorted yet? If not, I can suggest a few ideas under £20 with next-day delivery 🎁",
    chips: [
      { label: 'Gift ideas', msg: 'Give me gift ideas for Mia' },
      { label: 'Card message ideas', msg: 'Suggest a birthday card message' },
    ],
  },
  {
    id: 'phonics',
    day: '8',
    month: 'Jun',
    title: '📖 Y1 Phonics Screening Week',
    sub: 'Akiva newsletter · awareness only',
  },
  {
    id: 'shacharit',
    day: '9',
    month: 'Jun',
    title: '🌍 Year 5 Shacharit — parents invited',
    sub: '9am start · Akiva newsletter',
  },
  {
    id: 'music-fest',
    day: '10',
    month: 'Jun',
    title: '🎵 Barnet Music Festival',
    sub: 'Choir & Band · Arts Depot · Akiva newsletter',
  },
  {
    id: 'sports-day',
    day: '10',
    month: 'Jun',
    title: '☀️ Sports day',
    sub: `${k0.name} — pack: trainers, sun hat, water bottle`,
    opener: `Sports day for ${k0.name} is coming up. Kit checklist: trainers (not school shoes), a sun hat, a labelled water bottle, an extra snack, and suncream before school. Want me to set a Sunday evening reminder to pack the bag?`,
    chips: [{ label: 'Set a reminder', msg: 'Set a reminder to pack sports day kit' }],
  },
  {
    id: 'fday',
    day: '14',
    month: 'Jun',
    title: "👨‍👩‍👧 Father's Day",
    sub: `${p} — Taylo can help sort something special`,
    opener: `Father's Day is coming up — want some ideas for ${p}? I can pull together a few gift or activity ideas if that'd help.`,
    chips: [
      { label: 'Gift ideas', msg: "Gift ideas for Father's Day" },
      { label: 'Activity ideas', msg: "Activity ideas for Father's Day" },
    ],
  },
  {
    id: 'y6-res',
    day: '15',
    month: 'Jun',
    title: '🏖️ Year 6 Residential Trip',
    sub: 'Mon–Fri · Akiva newsletter',
  },
  {
    id: 'gp-checkup',
    day: '19',
    month: 'Jun',
    title: `🏥 ${k1.name}'s GP check-up`,
    sub: 'Confirmed via NHS email ✔️ · 10:30am',
    opener: `Just flagging — ${k1.name}'s 2-year check-up is confirmed for Thu 19 June, 10:30am at Wimbledon HC. I picked this up from an NHS email.`,
    emailCard: true,
    chips: [
      { label: 'Add a reminder', msg: 'Remind me the day before the GP appointment' },
      { label: 'What should I bring?', msg: 'What should I bring to a 2-year check-up?' },
    ],
  },
  {
    id: 'holidays',
    day: '25',
    month: 'Jul',
    title: '🏖️ School holidays begin',
    sub: '6 weeks · Taylo will help you plan',
  },
];

export const demoChecklists: Checklist[] = [
  {
    id: 'partyCL',
    headBg: 'rose',
    title: `🎂 ${k0.name}'s birthday party`,
    sub: 'From your calendar · plan ahead',
    items: [
      { text: 'Choose a theme or venue', when: 'first' },
      { text: 'Write the guest list', when: 'this week' },
      { text: 'Book venue or confirm at home', when: 'this week' },
      { text: 'Send invitations', when: '3 weeks before' },
      { text: 'Order cake or plan baking', when: '1 week before' },
      { text: 'Sort party bags and decorations', when: 'a few days before' },
    ],
  },
  {
    id: 'schoolCL',
    headBg: 'blue',
    title: `📧 From ${s} newsletters`,
    sub: 'Taylo extracted these for you',
    items: [
      { text: 'Update photo permissions', when: 'this week' },
      { text: 'Buy Early Bird panto tickets — JW3', when: 'act soon' },
      { text: 'Uniform check — skirt length, no jewellery', when: 'Monday' },
      { text: 'Check old craft supplies at home (asbestos)', when: 'this week' },
    ],
  },
  {
    id: 'holidayCL',
    headBg: 'amber',
    title: '☀️ Summer holidays — 7 weeks',
    sub: "Taylo's pre-holiday checklist",
    items: [
      { text: 'Childcare / holiday club booked', when: 'urgent' },
      { text: "Check passports haven't expired", when: 'this week' },
      { text: "Kids' suncream ordered", when: 'done ✓', done: true },
      { text: 'Sort summer clothes — check sizes', when: '2 weeks' },
      { text: 'Book an activity for week 1', when: '3 weeks' },
    ],
  },
];

export const demoEmailToggles = [
  { key: 'newsletters', label: 'School newsletters', sub: 'Extracts dates, deadlines, events', on: true },
  { key: 'orders', label: 'Shopping orders', sub: 'Tesco, Amazon, delivery confirmations', on: true },
  { key: 'nhs', label: 'NHS & appointments', sub: 'GP, dentist, hospital letters', on: true },
  { key: 'finance', label: 'Finance & bills', sub: 'Bank alerts, utility reminders', on: false },
];

export const demoCalToggles = [
  { key: 'family', label: 'Family events', sub: 'Birthdays, parties, activities', on: true },
  { key: 'appointments', label: 'Appointments', sub: 'Medical, school, other bookings', on: true },
  { key: 'reminders', label: 'Taylo reminders', sub: 'Write-back reminders from Taylo', on: true },
];

export const generalChatChips: Chip[] = [
  { label: 'What else this week?', msg: 'What else this week?' },
  { label: 'Sports day kit', msg: 'Sports day kit list' },
  { label: 'Dinner ideas', msg: 'Dinner ideas this week' },
  { label: 'Clubs brochure?', msg: 'Did the clubs brochure arrive?' },
];

export const genericAheadChips: Chip[] = [
  { label: "What's the plan?", msg: "What's the plan for this?" },
  { label: 'Remind me nearer the time', msg: 'Remind me about this closer to the date' },
];

export function greetingForNow(name: string) {
  const hr = new Date().getHours();
  const timeGreet = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
  const timeEmoji = hr < 12 ? '👋' : hr < 17 ? '🌞' : '🌙';
  return `Good ${timeGreet}, ${name} ${timeEmoji}`;
}

export function todaySummaryText(urgentCount: number) {
  const things = urgentCount === 1 ? 'thing' : 'things';
  return `Taylo processed 12 messages today — ${urgentCount} ${things} needing your attention, 5 added to Ahead, and 4 that didn't need any action.`;
}

export function aheadNoticedText() {
  return `5 new things this week from the ${s} newsletter and your calendar — Sports Day, the Year 6 Residential, the Barnet Music Festival, ${k1.name}'s GP check-up, and the clubs brochure Taylo's watching for (expected by 12 June). All added to Ahead below.`;
}

export function splitIconTitle(raw: string) {
  const t = (raw || '').trim();
  const m = t.match(/^([\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}️‍]+)\s*(.*)$/u);
  if (m && m[2]) return { icon: m[1].trim(), text: m[2].trim() };
  return { icon: '📌', text: t };
}

export function genericAheadOpener(text: string, sub: string) {
  return `${text}${sub ? ` — ${sub}.` : '.'} Want help with anything here, or just keeping it on your radar for now?`;
}

export function chatReply(txt: string) {
  const lower = txt.toLowerCase();
  if (lower.includes('what else')) {
    return `Here's your week 📋\n\n🎭 Panto Early Bird tickets — act soon\n📷 Photo permissions — reminder set for tonight\n📌 Clubs brochure watch set for 12 June\n🛒 Nappies/toothpaste/Calpol may be running low`;
  }
  if (lower.includes('clubs brochure')) {
    return `I've got a watch set for that 📃 The 29 May newsletter said it would arrive 'within 2 weeks' — so by around 12 June. I'll nudge you if it hasn't landed by then. The new clubs include Robotics for KS1, STEM for KS2, and Photography for both. Exciting!`;
  }
  if (lower.includes('photo permission')) {
    return `Reminder set for 8pm tonight ✔️ "Update Akiva photo permissions." Anything else?`;
  }
  if (lower.includes('sport')) {
    return `Sports day kit for ${k0.name}:\n\n💖 Trainers (not school shoes)\n🧢 Sun hat\n💧 Water bottle (labelled!)\n🍏 Extra snack\n🧴 Suncream before school\n\nShall I set a Sunday evening reminder?`;
  }
  if (lower.includes('dinner')) {
    return `Here are 3 quick dinners:\n\n🍝 Monday: pasta with hidden veg\n🍣 Wednesday: salmon teriyaki\n🍔 Friday: homemade burgers\n\nWant me to put together a shopping list?`;
  }
  if (lower.includes('father')) {
    return `Some ideas for ${p}:\n\n⛳ Golf lesson experience — ~£35\n🍺 Craft beer tasting box — ~£25\n🏛️ Family day out voucher\n\nWant help finding somewhere?`;
  }
  if (lower.includes('gift')) {
    return `Here are a few ideas under £20 with next-day delivery:\n\n🎨 Crayola Art Set — £14.99\n🧁 Cupcake Baking Kit — ~£14\n✨ Magic Colour-Change Pens — ~£15\n\nWant me to pick one and remind you to order it?`;
  }
  return `On it! Let me look into that for you 👀`;
}

export const memberPalette = [
  { bg: 'roseLight' as const, fg: 'roseDark' as const },
  { bg: 'blueLight' as const, fg: 'blue' as const },
  { bg: 'amberLight' as const, fg: 'amber' as const },
  { bg: 'tealLight' as const, fg: 'teal' as const },
];
