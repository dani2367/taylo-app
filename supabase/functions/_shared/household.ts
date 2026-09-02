import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type Household = {
  userName: string | null;
  children: string[];
  partner: string | null;
};

type MemberRow = {
  role: string | null;
  first_name: string | null;
};

export async function loadHousehold(supabase: SupabaseClient, userId: string): Promise<Household> {
  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('first_name').eq('id', userId).maybeSingle(),
    supabase.from('family_members').select('role, first_name').eq('user_id', userId),
  ]);

  const children: string[] = [];
  let partner: string | null = null;
  for (const row of (members ?? []) as MemberRow[]) {
    const name = row.first_name?.trim();
    if (!name) continue;
    const role = (row.role || '').toLowerCase();
    if (role === 'child') children.push(name);
    else if (role === 'partner') partner = name;
  }

  return {
    userName: (profile as { first_name?: string | null } | null)?.first_name?.trim() || null,
    children,
    partner,
  };
}

export function householdVoiceBlock(household: Household): string {
  const user = household.userName;
  const kids = household.children;
  const partner = household.partner;

  const familyBits: string[] = [];
  if (kids.length) familyBits.push(`children: ${kids.join(', ')}`);
  if (partner) familyBits.push(`partner: ${partner}`);

  const lines = [
    user
      ? `The person you are talking to is ${user}. Address them as "you" / "your". Never refer to ${user} in the third person (never "${user} is due" or "${user}'s checkup" when you mean theirs).`
      : 'Address the parent as "you". Never use their name in the third person.',
    kids.length
      ? `When an email or nudge is about a child, use that child's name. Example: if it is about ${kids[0]}, say "${kids[0]}'s trip" / "confirm ${kids[0]}'s appointment" — not "your son" if you know the name, and not the parent's name.`
      : 'If the email is about a child, use the child\'s name from the email.',
    'who_it_affects: "you" if it is the parent\'s own admin; the child\'s first name if it is about them; the partner\'s name if it is about them.',
  ];
  if (familyBits.length) {
    lines.push(`This household: ${familyBits.join('; ')}. Only use these names when the item is actually about them. Do not invent extra children.`);
  }
  return lines.join('\n');
}

export function whoForPrompt(who: string | null, household: Household): string {
  if (!who) return 'not specified';
  const trimmed = who.trim();
  if (household.userName && trimmed.toLowerCase() === household.userName.toLowerCase()) {
    return 'you (the parent — never use their name)';
  }
  return trimmed;
}
