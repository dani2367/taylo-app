export type GraphHeader = { name?: string; value?: string };

export type FilterableEmail = {
  inferenceClassification?: string;
  internetMessageHeaders?: GraphHeader[];
  sender?: { emailAddress?: { address?: string; name?: string } };
  subject?: string;
  bodyPreview?: string;
};

const FAMILY_HINT =
  /\b(school|nursery|childminder|childcare|teacher|headteacher|term dates?|sports day|inset|ofsted|parents'? evening|permission slip|permission form|trip form|school trip|uniform|assembly|concert|club|fixture|match|kick[- ]?off|playdate|birthday party|rsvp|nhs|gp\b|hospital|dentist|doctor|appointment|prescription|vaccine|immunisation|immunization|pickup|pick-up|after[- ]school|delivery failed|out for delivery|return label|click and collect)\b/i;

export function looksFamilyRelevant(email: FilterableEmail): boolean {
  const text = [
    email.subject,
    email.bodyPreview,
    email.sender?.emailAddress?.name,
    email.sender?.emailAddress?.address,
  ]
    .filter(Boolean)
    .join(' ');
  return FAMILY_HINT.test(text);
}

export function hasBulkSignal(email: FilterableEmail): boolean {
  const headers = email.internetMessageHeaders ?? [];
  return headers.some((header) => {
    const name = (header.name ?? '').toLowerCase();
    const value = header.value ?? '';
    if (name === 'list-unsubscribe' || name === 'list-id') return true;
    if (name === 'precedence' && /bulk|junk|list/i.test(value)) return true;
    if (name === 'x-campaignid' || name === 'x-mailer' && /mailchimp|sendgrid|exacttarget|klaviyo/i.test(value)) {
      return true;
    }
    return false;
  });
}

/** Why Taylo should skip Claude. Null means send it on (after other drop rules). */
export function outlookPrefilterReason(email: FilterableEmail): string | null {
  const family = looksFamilyRelevant(email);
  if (hasBulkSignal(email) && !family) return 'bulk';
  const classification = (email.inferenceClassification ?? '').toLowerCase();
  if (classification === 'other' && !family) return 'outlook_other';
  return null;
}
