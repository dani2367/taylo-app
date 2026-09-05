const GREETING_RE = /^(hi|hello|hey|dear)\b/i;
const SIGNOFF_RE = /^(thanks|thank you|kind regards|best|cheers|yours|many thanks)\b/i;
const REMINDER_RE = /^(just\s+)?(a\s+)?reminder\s+that\s+/i;
const PLEASE_RE = /^please\s+/i;
const HEDGE_RE = /\s+if you haven['’]t already\.?$/i;

export type ItemNarrative = {
  body: string | null;
  detail: string | null;
  suggestion: string | null;
  action_description: string | null;
};

function sentencesFrom(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 8);
}

function tidySentence(raw: string): string {
  let text = raw.replace(/\s+/g, ' ').trim();
  text = text.replace(REMINDER_RE, '').replace(PLEASE_RE, '').replace(HEDGE_RE, '.');
  if (!text) return '';
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}

function clipWords(raw: string, maxWords: number): string {
  const words = raw.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '').split(' ').filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ');
}

/** Rebuild Home/Plan copy from the source email after list-folding wiped it. */
export function narrativeFromSourceEmail(
  email: { subject?: string | null; body?: string | null },
  title?: string | null,
): ItemNarrative {
  const lines = (email.body || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s+/, '').trim())
    .filter(Boolean)
    .filter((line) => !GREETING_RE.test(line) && !SIGNOFF_RE.test(line));

  const cleaned = lines
    .map((line) => tidySentence(line).replace(/[.!?]$/, ''))
    .filter(Boolean);

  const blob = cleaned.join('. ');
  const sentences = sentencesFrom(blob ? `${blob}.` : '');
  const first = sentences[0] || clipWords(email.subject || title || '', 12);
  const body = first ? clipWords(first, 12) : null;
  const detail = (sentences.slice(0, 6).join(' ') || first || '').trim() || null;
  const action = sentences.find((sentence) => /\b(return|complete|sign|pay|bring|pack|send)\b/i.test(sentence));
  const suggestion = action ? clipWords(action, 10) : null;

  return {
    body,
    detail,
    suggestion,
    action_description: (title || '').trim() || action || null,
  };
}
