export function isGenericHelp(raw: string | null | undefined): boolean {
  const text = (raw || '').trim();
  if (!text) return true;
  return /need a hand\??|chat and taylo can help|help you get this done/i.test(text);
}

export function formatStoredSuggestion(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim().replace(/^suggested:\s*/i, '');
  if (!trimmed || isGenericHelp(trimmed)) return null;
  return trimmed;
}

/** A short, practical next step — never the generic “need a hand” line. */
export function helpfulSuggestion(item: {
  title?: string | null;
  body?: string | null;
  category?: string | null;
  event_date?: string | null;
  suggestion?: string | null;
  action_description?: string | null;
}): string | null {
  const stored = formatStoredSuggestion(item.suggestion);
  if (stored) return stored;

  const title = (item.title || '').trim();
  const blob = `${title} ${item.body || ''} ${item.category || ''} ${item.action_description || ''}`.toLowerCase();

  if (/\bpassport\b/.test(blob)) {
    return "You'll need a digital photo and the current passport. I can walk you through the GOV.UK form if that's useful.";
  }
  if (/\b(visa|ehic|ghic)\b/.test(blob)) {
    return 'Have the travel dates and passport numbers to hand — I can help you start the form.';
  }
  if (/\b(birthday|bday|party)\b/.test(blob) && /\b(card|present|gift)\b/.test(blob)) {
    return 'If the present is sorted, a card from a supermarket on the way home is usually enough.';
  }
  if (/\b(permission|ofsted|form|paperwork)\b/.test(blob)) {
    return 'I can draft a reply or tick through the form with you if you want to get it sent.';
  }
  if (/\b(dentist|doctor|gp|hospital|optician|appointment)\b/.test(blob)) {
    return 'I can help you confirm the time, what to take, or rearrange if it no longer works.';
  }
  if (/\b(return|refund|exchange)\b/.test(blob)) {
    return 'Check the deadline on the receipt — I can help you start the return if you want it off your plate.';
  }
  if (/\b(school|nursery|uniform|pe kit)\b/.test(blob)) {
    return 'I can help you check what they actually need and get a note ready if you want.';
  }
  if (/\b(shop|shopping|tesco|sainsbury|waitrose|grocer)\b/.test(blob)) {
    return 'Tell me what you still need and I can add it to the list.';
  }
  if (/\b(bill|insurance|mot|tax|passport photo)\b/.test(blob)) {
    return 'I can help you find the right page and what they usually ask for.';
  }

  const action = (item.action_description || '').trim();
  if (action && !isGenericHelp(action) && action.toLowerCase() !== title.toLowerCase()) {
    return action;
  }

  if (title) {
    const clipped = title.replace(/\s+/g, ' ').trim();
    return `I can help you get “${clipped}” moving — ask me for the next concrete step.`;
  }
  return null;
}

const CONTEXT_STOP = new Set([
  'a',
  'an',
  'the',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'and',
  'or',
  'with',
  'from',
  'this',
  'that',
  'your',
  'our',
  'is',
  'it',
]);

const CONTEXT_TEMPORAL =
  /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|week|weekend|month|year|next|this|\d{1,2}(?:st|nd|rd|th)?|\d{4}|am|pm)$/i;

function contextTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !CONTEXT_STOP.has(word));
}

/** Extra event detail worth showing — omit if it only restates the title or adds a date. */
export function extraEventContext(
  title: string | null | undefined,
  extra: string | null | undefined,
): string | null {
  const text = (extra || '').replace(/\s+/g, ' ').trim();
  const head = (title || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length < 8) return null;
  if (text.toLowerCase() === head.toLowerCase()) return null;

  const titleToks = new Set(contextTokens(head));
  const extraToks = contextTokens(text);
  if (!extraToks.length) return null;

  const novel = extraToks.filter((word) => !titleToks.has(word));
  if (!novel.length) return null;
  if (novel.every((word) => CONTEXT_TEMPORAL.test(word))) return null;

  return text;
}

/** First finished sentence — never an ellipsis mid-thought. */
export function firstCompleteSentence(raw: string | null | undefined): string | null {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const match = text.match(/^.+?[.!?…](?=\s|$)/);
  if (match) return match[0].trim();
  if (text.length > 140) return null;
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** Collapsed Home subline: a short readable sentence, never a bare relative date. */
export function actionSupportLine(item: {
  title?: string | null;
  body?: string | null;
  reason?: string | null;
  category?: string | null;
}): string | null {
  const reason = (item.reason || '').replace(/\s+/g, ' ').trim();
  if (
    reason &&
    !/^\d+\s+days ago$/i.test(reason) &&
    !/^yesterday$/i.test(reason) &&
    extraEventContext(item.title, reason)
  ) {
    return firstCompleteSentence(reason);
  }
  const body = (item.body || '').replace(/\s+/g, ' ').trim();
  if (extraEventContext(item.title, body)) {
    return firstCompleteSentence(body);
  }
  const blob = `${item.title || ''} ${item.category || ''}`.toLowerCase();
  if (/\bpassport\b/.test(blob)) return 'Photos and the GOV.UK form when you have a minute.';
  if (/\b(return|refund)\b/.test(blob)) return 'Check the deadline, then I can help you start it.';
  if (/\b(birthday|party)\b/.test(blob)) return 'Coming up — worth a quick check on the present.';
  if (/\b(form|permission)\b/.test(blob)) return 'A short form to send when you have a moment.';
  const title = (item.title || '').trim();
  if (!title) return null;
  return 'Something to get done when you have a minute.';
}
