import type { Chip } from './demo-data';

const CHIP_PARENT_ASK =
  /^(give me|can you|could you|would you|please |what |what's |whats |how |suggest |draft |remind me|send me|help me|i need|i want|tell me|write |start |add )/i;
const CHIP_ASSISTANT_VOICE =
  /^(here(?:'s| is| are)\b|you might\b|you could\b|you may\b|i can\b|i['’]ll\b|let me\b)/i;

/** Suggested prompts must read as the parent asking Taylo, never as Taylo speaking. */
export function chipAsParentAsk(chip: Chip): Chip {
  const label = (chip.label || '').replace(/\s+/g, ' ').trim();
  const msg = (chip.msg || '').replace(/\s+/g, ' ').trim();
  if (!label || !msg) return { label, msg };
  if (CHIP_ASSISTANT_VOICE.test(msg)) {
    return { label, msg: `Can you help with ${label.toLowerCase()}?` };
  }
  if (CHIP_PARENT_ASK.test(msg) || /[?]$/.test(msg)) return { label, msg };
  return { label, msg: `Give me ${msg.charAt(0).toLowerCase()}${msg.slice(1)}` };
}

export function isGenericHelp(raw: string | null | undefined): boolean {
  const text = (raw || '').trim();
  if (!text) return true;
  return /need a hand\??|chat and taylo can help|help you get this done|i can help you get .+ moving|ask me for the next concrete step/i.test(
    text,
  );
}

export function formatStoredSuggestion(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim().replace(/^suggested:\s*/i, '');
  if (!trimmed || isGenericHelp(trimmed)) return null;
  return trimmed;
}

/** Sparkle copy: stored suggestion only, and only if it is not a restatement. */
export function helpfulSuggestion(item: {
  title?: string | null;
  body?: string | null;
  detail?: string | null;
  suggestion?: string | null;
}): string | null {
  const stored = formatStoredSuggestion(item.suggestion);
  if (!stored) return null;
  const needle = stored.replace(/\s+/g, ' ').trim().toLowerCase();
  for (const other of [item.title, item.detail, item.body]) {
    const value = (other || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (value && value === needle) return null;
  }
  return stored;
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

/** Honorifics and similar tokens whose period is not the end of the sentence. */
const SENTENCE_ABBREV = /\b(?:Dr|Mr|Mrs|Ms|Miss|Prof|Sr|Jr|St|vs|etc)\.$/i;

/** First finished sentence — never an ellipsis mid-thought, and never stop at "Dr." */
export function firstCompleteSentence(raw: string | null | undefined): string | null {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    const boundary = i === text.length - 1 || /\s/.test(text[i + 1] || '');
    if (!boundary) continue;
    const soFar = text.slice(0, i + 1);
    if (ch === '.' && SENTENCE_ABBREV.test(soFar)) continue;
    return soFar.trim();
  }
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
