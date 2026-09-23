/** Which item row `source_emails.item_id` points at. Children follow the parent. */
export function sourceEmailLookupId(item: { id: string; parent_id?: string | null }): string {
  const parent = (item.parent_id || '').trim();
  return parent || item.id;
}

const WITHOUT_EMAIL = new Set(['chat', 'manual', 'action_library']);

/**
 * Whether the expanded card offers "View original email".
 * Gated on provenance (`source`), never on `kind`.
 * Email always. Calendar only after a merge left a `source_emails` row on the surviving item.
 */
export function originalEmailVisible(source: string | null | undefined, attachedCount: number): boolean {
  if (!source || WITHOUT_EMAIL.has(source)) return false;
  if (source === 'email') return true;
  if (source === 'calendar') return attachedCount > 0;
  return false;
}

export function shouldLoadSourceEmails(source: string | null | undefined): boolean {
  return source === 'email' || source === 'calendar';
}

/** Most recent first. `received_at` wins; `created_at` fills in when the timestamp is missing. */
export function orderSourceEmails<T extends { received_at?: string | null; created_at?: string | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const ak = a.received_at || a.created_at || '';
    const bk = b.received_at || b.created_at || '';
    return bk.localeCompare(ak);
  });
}

export type EmailChainMessage = {
  sender: string | null;
  sent: string | null;
  subject: string | null;
  body: string;
};

function normalizeEmailText(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function unquoteLine(line: string): string {
  return line.replace(/\s+$/g, '').replace(/^(?:>\s?)+/, '').replace(/\s*>$/, '');
}

function headerField(line: string): { key: string; value: string } | null {
  const match = unquoteLine(line)
    .trim()
    .match(/^(from|sent|to|cc|bcc|subject|date)\s*:\s*(.*)$/i);
  if (!match) return null;
  return { key: match[1].toLowerCase(), value: match[2].trim() };
}

function isOutlookHeaderStart(lines: string[], index: number): boolean {
  const first = headerField(lines[index] ?? '');
  if (!first || first.key !== 'from') return false;
  let seen = 0;
  for (let i = index + 1; i < lines.length && seen < 6; i++) {
    const trimmed = unquoteLine(lines[i]).trim();
    if (!trimmed) continue;
    const field = headerField(trimmed);
    if (!field) return false;
    seen += 1;
    if (field.key === 'sent' || field.key === 'date' || field.key === 'to' || field.key === 'subject') return true;
  }
  return false;
}

function isWroteLine(line: string): boolean {
  return /^on\s+.+\swrote:$/i.test(unquoteLine(line).trim());
}

function isChainBanner(line: string): boolean {
  const trimmed = unquoteLine(line).trim();
  return /^-{2,}\s*original message\s*-{2,}$/i.test(trimmed) || /^begin forwarded message:$/i.test(trimmed);
}

function parseWrote(line: string): { sender: string | null; sent: string | null } {
  const match = unquoteLine(line)
    .trim()
    .match(/^on\s+(.+?)\s+wrote:$/i);
  const rest = match?.[1]?.trim() ?? '';
  const comma = rest.lastIndexOf(',');
  if (comma === -1) return { sender: rest || null, sent: null };
  return {
    sent: rest.slice(0, comma).trim() || null,
    sender: rest.slice(comma + 1).trim() || null,
  };
}

type ChainDraft = {
  sender: string | null;
  sent: string | null;
  subject: string | null;
  lines: string[];
};

function blankDraft(): ChainDraft {
  return { sender: null, sent: null, subject: null, lines: [] };
}

function takeOutlookHeaders(lines: string[], start: number): { draft: ChainDraft; next: number } {
  const draft = blankDraft();
  let i = start;
  let fields = 0;
  for (; i < lines.length; i++) {
    const trimmed = unquoteLine(lines[i]).trim();
    if (!trimmed) {
      if (fields > 0) {
        i += 1;
        break;
      }
      continue;
    }
    const field = headerField(trimmed);
    if (!field) break;
    fields += 1;
    if (field.key === 'from') draft.sender = field.value || draft.sender;
    if (field.key === 'sent' || field.key === 'date') draft.sent = field.value || draft.sent;
    if (field.key === 'subject') draft.subject = field.value || draft.subject;
    if (fields >= 8) {
      i += 1;
      break;
    }
  }
  return { draft, next: i };
}

function chainText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when `inner` is the same writing already contained in `outer`. */
function repeatsEarlier(inner: string, outer: string): boolean {
  const a = chainText(inner);
  const b = chainText(outer);
  if (a.length < 24 || a.length > b.length) return false;
  return b.includes(a.slice(0, Math.min(a.length, 180)));
}

function squashRepeatedSends(parts: EmailChainMessage[]): EmailChainMessage[] {
  if (parts.length < 2) return parts;
  const kept: EmailChainMessage[] = [parts[0]];
  for (const part of parts.slice(1)) {
    const previous = kept[kept.length - 1];
    if (kept.length > 1 && repeatsEarlier(previous.body, part.body)) {
      kept[kept.length - 1] = part;
      continue;
    }
    if (repeatsEarlier(part.body, previous.body)) continue;
    kept.push(part);
  }
  return kept;
}

/**
 * One saved email often contains the earlier replies underneath the new writing.
 * Newest writing first, then each quoted send. A plain note with no chain stays one part.
 */
export function splitEmailChain(body: string | null | undefined): EmailChainMessage[] {
  const text = normalizeEmailText(body ?? '').trim();
  if (!text) return [];
  const lines = text.split('\n');
  const drafts: ChainDraft[] = [];
  let current = blankDraft();

  const flush = () => {
    const bodyText = current.lines.join('\n').trim();
    const finished = current;
    current = blankDraft();
    if (!bodyText) return;
    drafts.push({
      sender: finished.sender,
      sent: finished.sent,
      subject: finished.subject,
      lines: [bodyText],
    });
  };

  let i = 0;
  while (i < lines.length) {
    const boundary = isOutlookHeaderStart(lines, i) || isWroteLine(lines[i]) || isChainBanner(lines[i]);
    const hasText = current.lines.some((line) => unquoteLine(line).trim());
    if (boundary && hasText) {
      const bodyText = current.lines.join('\n').trim();
      if (bodyText) {
        drafts.push({
          sender: current.sender,
          sent: current.sent,
          subject: current.subject,
          lines: [bodyText],
        });
      }
      current = blankDraft();
    }

    if (isOutlookHeaderStart(lines, i)) {
      const taken = takeOutlookHeaders(lines, i);
      if (hasText || drafts.length > 0) {
        current.sender = taken.draft.sender;
        current.sent = taken.draft.sent;
        current.subject = taken.draft.subject;
      }
      i = taken.next;
      continue;
    }

    if (isChainBanner(lines[i])) {
      i += 1;
      if (isOutlookHeaderStart(lines, i)) {
        const taken = takeOutlookHeaders(lines, i);
        current.sender = taken.draft.sender;
        current.sent = taken.draft.sent;
        current.subject = taken.draft.subject;
        i = taken.next;
      }
      continue;
    }

    if (isWroteLine(lines[i]) && (hasText || drafts.length > 0)) {
      const who = parseWrote(lines[i]);
      current.sender = who.sender;
      current.sent = who.sent;
      i += 1;
      continue;
    }

    current.lines.push(unquoteLine(lines[i]));
    i += 1;
  }

  flush();
  return squashRepeatedSends(
    drafts.map((draft) => ({
      sender: draft.sender,
      sent: draft.sent,
      subject: draft.subject,
      body: draft.lines.join('\n').trim(),
    })),
  );
}

/** Blank-line paragraphs for the plain-text original. Single newlines stay inside a paragraph. */
export function emailBodyParagraphs(body: string | null | undefined): string[] {
  const text = (body ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

type SourceEmailAccess = {
  user_id: string;
};

type SourceEmailItemAccess = {
  created_by: string;
  visibility: string | null;
  household_id: string | null;
};

/**
 * Same rule as `source_emails` SELECT: the mailbox owner, or anyone who can see the linked item.
 * A missing item (deleted parent) stays with the mailbox owner.
 */
export function canReadSourceEmail(
  email: SourceEmailAccess,
  item: SourceEmailItemAccess | null,
  viewer: { userId: string; householdId: string },
): boolean {
  if (email.user_id === viewer.userId) return true;
  if (!item) return false;
  if (item.created_by === viewer.userId) return true;
  return item.visibility === 'shared' && item.household_id === viewer.householdId;
}
