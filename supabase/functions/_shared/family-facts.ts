import { isExcludedPrep, type IntakeItem } from './intake-contract.ts';

export const FACT_TYPES = ['person_attribute', 'household_pattern'] as const;
export const FACT_SOURCES = [
  'manual',
  'user_confirmation',
  'inferred_email',
  'inferred_chat',
  'inferred_behavior',
] as const;
export const FACT_CONFIDENCE = ['high', 'medium', 'low'] as const;
export const FACT_STATUSES = ['active', 'pending_review', 'rejected', 'superseded'] as const;

export type FactType = (typeof FACT_TYPES)[number];
export type FactSource = (typeof FACT_SOURCES)[number];
export type FactConfidence = (typeof FACT_CONFIDENCE)[number];
export type FactStatus = (typeof FACT_STATUSES)[number];

export type FamilyFact = {
  id: string;
  user_id: string;
  household_id: string | null;
  person_id: string | null;
  fact_type: FactType;
  content: string;
  source: FactSource;
  confidence: FactConfidence;
  status: FactStatus;
  superseded_by: string | null;
  first_observed: string;
  last_confirmed: string | null;
  evidence_key: string;
  evidence: string;
  subject?: string;
  category?: string;
};

export type FamilyMemberRef = {
  id: string;
  first_name: string | null;
};

export type FamilyFactsStore = {
  facts: FamilyFact[];
  seq: number;
};

export type ProposedFact = {
  person_id?: string | null;
  person_name?: string | null;
  fact_type: FactType;
  content: string;
  source: Exclude<FactSource, 'manual'>;
  confidence?: FactConfidence;
  evidence?: string;
};

export type ManualFactInput = {
  person_id?: string | null;
  person_name?: string | null;
  fact_type: FactType;
  content: string;
};

type Clock = () => string;

const defaultNow: Clock = () => new Date().toISOString();

export function emptyFactsStore(): FamilyFactsStore {
  return { facts: [], seq: 1 };
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'is',
  'has',
  'have',
  'of',
  'for',
  'and',
  'with',
  'in',
]);

export function normalizeFactText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\ballergic\b/g, 'allergy')
    .replace(/\bintolerant\b/g, 'intolerance')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(text: string): Set<string> {
  return new Set(
    normalizeFactText(text)
      .split(' ')
      .map((part) => (part.endsWith('s') && part.length > 3 ? part.slice(0, -1) : part))
      .filter((part) => part.length > 1 && !STOP_WORDS.has(part)),
  );
}

export function evidenceKeyFor(params: {
  person_id: string | null;
  fact_type: FactType;
  content: string;
}): string {
  return `${params.person_id ?? 'household'}|${params.fact_type}|${normalizeFactText(params.content)}`;
}

export function factTopicKey(content: string): string {
  const t = content.toLowerCase();
  if (/\b(presents?|gifts?|cards?)\b/.test(t)) return 'gifts';
  if (/(allerg|intoleran|dietary|nut[- ]free|peanuts?|gluten|dairy|vegan|halal|kosher)/.test(t)) {
    return 'dietary';
  }
  if (/\b(handles?|typically|usually|i (?:do|handle)|dad does|mum does|mom does)\b/.test(t)) {
    return 'task_ownership';
  }
  return normalizeFactText(content);
}

function polarity(content: string): 'neg' | 'pos' {
  if (/\b(no|never|not |don't|doesn'?t|does not|without|allergic|intoleran)\b/i.test(content)) {
    return 'neg';
  }
  return 'pos';
}

export function factsContradict(a: Pick<FamilyFact, 'person_id' | 'fact_type' | 'content'>, b: Pick<FamilyFact, 'person_id' | 'fact_type' | 'content'>): boolean {
  if ((a.person_id ?? null) !== (b.person_id ?? null)) return false;
  if (a.fact_type !== b.fact_type) return false;
  if (factTopicKey(a.content) !== factTopicKey(b.content)) return false;
  return polarity(a.content) !== polarity(b.content);
}

export function similarEvidence(a: string, b: string): boolean {
  const na = normalizeFactText(a);
  const nb = normalizeFactText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = tokens(na);
  const tb = tokens(nb);
  if (!ta.size || !tb.size) return false;
  let overlap = 0;
  for (const token of ta) if (tb.has(token)) overlap += 1;
  const union = new Set([...ta, ...tb]).size;
  return overlap / union >= 0.72;
}

export function inferredSourceStatus(source: FactSource): FactStatus {
  if (source === 'manual' || source === 'user_confirmation') return 'active';
  return 'pending_review';
}

function nextId(store: FamilyFactsStore): string {
  const id = `fact_${store.seq}`;
  store.seq += 1;
  return id;
}

function resolvePersonId(
  person_id: string | null | undefined,
  person_name: string | null | undefined,
  members: FamilyMemberRef[],
): string | null {
  if (person_id) return person_id;
  const needle = (person_name || '').trim().toLowerCase();
  if (!needle || needle === 'household' || needle === 'family' || needle === 'everyone') return null;
  const match = members.find((row) => (row.first_name || '').trim().toLowerCase() === needle);
  return match?.id ?? null;
}

function makeFact(
  store: FamilyFactsStore,
  params: {
    user_id?: string;
    household_id?: string | null;
    person_id: string | null;
    fact_type: FactType;
    content: string;
    source: FactSource;
    confidence: FactConfidence;
    status: FactStatus;
    evidence: string;
    now: string;
    id?: string;
  },
): FamilyFact {
  const content = params.content.replace(/\s+/g, ' ').trim();
  return {
    id: params.id ?? nextId(store),
    user_id: params.user_id ?? 'user',
    household_id: params.household_id ?? null,
    person_id: params.person_id,
    fact_type: params.fact_type,
    content,
    source: params.source,
    confidence: params.confidence,
    status: params.status,
    superseded_by: null,
    first_observed: params.now,
    last_confirmed: params.status === 'active' ? params.now : null,
    evidence_key: evidenceKeyFor({
      person_id: params.person_id,
      fact_type: params.fact_type,
      content,
    }),
    evidence: params.evidence,
    subject: params.person_id ? 'person' : 'household',
    category: legacyCategory(params.fact_type, content),
  };
}

export function legacyCategory(fact_type: FactType, content: string): string {
  const t = content.toLowerCase();
  if (fact_type === 'household_pattern') return 'routine';
  if (/\b(allerg|medical|intoleran|gp |surgery)\b/.test(t)) return 'medical';
  if (/\b(school|nursery|teacher)\b/.test(t)) return 'school';
  if (/\b(present|gift|prefer|no cards)\b/.test(t)) return 'preference';
  return 'other';
}

function supersedeContradictions(store: FamilyFactsStore, incoming: FamilyFact): void {
  for (const existing of store.facts) {
    if (existing.id === incoming.id) continue;
    if (existing.status !== 'active') continue;
    if (!factsContradict(existing, incoming)) continue;
    existing.status = 'superseded';
    existing.superseded_by = incoming.id;
  }
}

function blockedByRejected(store: FamilyFactsStore, proposal: FamilyFact): boolean {
  return store.facts.some(
    (row) =>
      row.status === 'rejected' &&
      (row.person_id ?? null) === (proposal.person_id ?? null) &&
      row.fact_type === proposal.fact_type &&
      similarEvidence(row.content, proposal.content),
  );
}

function existingOpenDuplicate(store: FamilyFactsStore, proposal: FamilyFact): FamilyFact | null {
  return (
    store.facts.find(
      (row) =>
        (row.status === 'active' || row.status === 'pending_review') &&
        (row.person_id ?? null) === (proposal.person_id ?? null) &&
        row.fact_type === proposal.fact_type &&
        similarEvidence(row.content, proposal.content),
    ) ?? null
  );
}

export function insertManualFact(
  store: FamilyFactsStore,
  input: ManualFactInput,
  opts?: { members?: FamilyMemberRef[]; now?: string; id?: string; user_id?: string; household_id?: string | null },
): FamilyFact {
  const now = opts?.now ?? defaultNow();
  const person_id = resolvePersonId(input.person_id, input.person_name, opts?.members ?? []);
  const fact = makeFact(store, {
    user_id: opts?.user_id,
    household_id: opts?.household_id,
    person_id,
    fact_type: input.fact_type,
    content: input.content,
    source: 'manual',
    confidence: 'high',
    status: 'active',
    evidence: input.content,
    now,
    id: opts?.id,
  });
  supersedeContradictions(store, fact);
  store.facts.push(fact);
  return fact;
}

export function insertInferredFact(
  store: FamilyFactsStore,
  input: ProposedFact,
  opts?: { members?: FamilyMemberRef[]; now?: string; id?: string; user_id?: string; household_id?: string | null },
): { ok: true; fact: FamilyFact } | { ok: false; reason: 'rejected_similar' | 'duplicate' } {
  const now = opts?.now ?? defaultNow();
  const person_id = resolvePersonId(input.person_id, input.person_name, opts?.members ?? []);
  const fact = makeFact(store, {
    user_id: opts?.user_id,
    household_id: opts?.household_id,
    person_id,
    fact_type: input.fact_type,
    content: input.content,
    source: input.source,
    confidence: input.confidence ?? 'medium',
    status: 'pending_review',
    evidence: input.evidence || input.content,
    now,
    id: opts?.id,
  });
  if (blockedByRejected(store, fact)) return { ok: false, reason: 'rejected_similar' };
  if (existingOpenDuplicate(store, fact)) return { ok: false, reason: 'duplicate' };
  store.facts.push(fact);
  return { ok: true, fact };
}

export function confirmFact(
  store: FamilyFactsStore,
  id: string,
  opts?: { now?: string },
): FamilyFact | null {
  const fact = store.facts.find((row) => row.id === id) ?? null;
  if (!fact || fact.status === 'rejected' || fact.status === 'superseded') return null;
  const now = opts?.now ?? defaultNow();
  fact.status = 'active';
  fact.last_confirmed = now;
  supersedeContradictions(store, fact);
  return fact;
}

export function dismissFact(store: FamilyFactsStore, id: string): FamilyFact | null {
  const fact = store.facts.find((row) => row.id === id) ?? null;
  if (!fact) return null;
  fact.status = 'rejected';
  fact.superseded_by = null;
  return fact;
}

/** Person attributes for the named person, plus household-level facts (person_id null). */
export function retrieveActiveFactsForPerson(
  facts: FamilyFact[],
  params: { person_id?: string | null; person_name?: string | null; members?: FamilyMemberRef[] },
): FamilyFact[] {
  const person_id = resolvePersonId(params.person_id, params.person_name, params.members ?? []);
  return facts.filter((row) => {
    if (row.status !== 'active') return false;
    if (row.person_id == null) return true;
    if (!person_id) return false;
    return row.person_id === person_id && row.fact_type === 'person_attribute';
  });
}

export function pendingFactsForReview(
  facts: FamilyFact[],
  params?: { person_id?: string | null },
): FamilyFact[] {
  return facts.filter((row) => {
    if (row.status !== 'pending_review') return false;
    if (!params || params.person_id === undefined) return true;
    return (row.person_id ?? null) === (params.person_id ?? null);
  });
}

export function factsPromptBlock(facts: FamilyFact[]): string {
  const active = facts.filter((row) => row.status === 'active');
  if (!active.length) return '';
  const lines = active.map((row) => {
    const who = row.person_id ? 'named person' : 'household';
    return `- ${who} [${row.fact_type}]: ${row.content}`;
  });
  return `Standing family facts (honor these automatically; do not wait for them to be restated in this source):\n${lines.join('\n')}`;
}

export function factsPromptBlockForPeople(
  facts: FamilyFact[],
  members: FamilyMemberRef[],
): string {
  const active = facts.filter((row) => row.status === 'active');
  if (!active.length) return '';
  const lines = active.map((row) => {
    const member = members.find((person) => person.id === row.person_id);
    const who = member?.first_name?.trim() || (row.person_id ? 'named person' : 'household');
    return `- ${who} [${row.fact_type}]: ${row.content}`;
  });
  return `Standing family facts (honor these automatically; do not wait for them to be restated in this source):\n${lines.join('\n')}`;
}

export function applyStandingFactsToIntake(items: IntakeItem[], facts: FamilyFact[]): IntakeItem[] {
  const standing = facts
    .filter((row) => row.status === 'active')
    .map((row) => row.content)
    .join('. ');
  if (!standing.trim()) return items;
  return items.filter((item) => !isExcludedPrep(item.title, standing));
}

export function parseStandingFacts(value: unknown): ProposedFact[] {
  if (!Array.isArray(value)) return [];
  const out: ProposedFact[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const content = typeof row.content === 'string' ? row.content.replace(/\s+/g, ' ').trim() : '';
    if (!content) continue;
    const fact_type = row.fact_type === 'household_pattern' ? 'household_pattern' : 'person_attribute';
    const confidence =
      row.confidence === 'high' || row.confidence === 'low' || row.confidence === 'medium'
        ? row.confidence
        : 'medium';
    const source =
      row.source === 'inferred_chat' || row.source === 'inferred_behavior'
        ? row.source
        : 'inferred_email';
    if (source === 'inferred_behavior') continue;
    const person =
      typeof row.person === 'string'
        ? row.person
        : typeof row.person_name === 'string'
          ? row.person_name
          : null;
    out.push({
      person_id: typeof row.person_id === 'string' ? row.person_id : null,
      person_name: person,
      fact_type,
      content,
      source,
      confidence,
      evidence: typeof row.evidence === 'string' ? row.evidence : content,
    });
  }
  return out.slice(0, 8);
}

export function mapFamilyFactRow(row: Record<string, unknown>): FamilyFact {
  const content = String(row.content || row.fact || '').trim();
  const sourceRaw = String(row.source || 'manual');
  const source: FactSource =
    sourceRaw === 'inferred'
      ? 'inferred_email'
      : FACT_SOURCES.includes(sourceRaw as FactSource)
        ? (sourceRaw as FactSource)
        : 'manual';
  const statusRaw = String(row.status || 'active');
  const status: FactStatus = FACT_STATUSES.includes(statusRaw as FactStatus)
    ? (statusRaw as FactStatus)
    : 'active';
  return {
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    household_id: (row.household_id as string | null) ?? null,
    person_id: (row.person_id as string | null) ?? null,
    fact_type: row.fact_type === 'household_pattern' ? 'household_pattern' : 'person_attribute',
    content,
    source,
    confidence:
      row.confidence === 'medium' || row.confidence === 'low' ? row.confidence : 'high',
    status,
    superseded_by: (row.superseded_by as string | null) ?? null,
    first_observed: String(row.first_observed || row.created_at || ''),
    last_confirmed: (row.last_confirmed as string | null) ?? null,
    evidence_key: String(row.evidence_key || normalizeFactText(content)),
    evidence: String(row.evidence || content),
    subject: typeof row.subject === 'string' ? row.subject : undefined,
    category: typeof row.category === 'string' ? row.category : undefined,
  };
}

export function rowFromFact(fact: FamilyFact): Record<string, unknown> {
  const row: Record<string, unknown> = {
    user_id: fact.user_id,
    household_id: fact.household_id,
    person_id: fact.person_id,
    fact_type: fact.fact_type,
    content: fact.content,
    fact: fact.content,
    subject: fact.subject || (fact.person_id ? 'person' : 'household'),
    category: fact.category || legacyCategory(fact.fact_type, fact.content),
    source: fact.source,
    confidence: fact.confidence,
    status: fact.status,
    superseded_by: fact.superseded_by,
    first_observed: fact.first_observed,
    last_confirmed: fact.last_confirmed,
    evidence_key: fact.evidence_key,
    evidence: fact.evidence,
  };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fact.id)) {
    row.id = fact.id;
  }
  return row;
}

type LooseClient = {
  from: (table: string) => any;
};

export const FAMILY_FACT_SELECT =
  'id, user_id, household_id, person_id, fact_type, content, fact, subject, category, source, confidence, status, superseded_by, first_observed, last_confirmed, evidence_key, evidence, created_at';

export async function loadHouseholdFacts(
  db: LooseClient,
  params: { userId: string; householdId?: string | null },
): Promise<{ householdId: string | null; members: FamilyMemberRef[]; facts: FamilyFact[] }> {
  let householdId = params.householdId ?? null;
  if (!householdId) {
    const { data: profile } = await db
      .from('profiles')
      .select('household_id')
      .eq('id', params.userId)
      .maybeSingle();
    householdId = (profile?.household_id as string | null) ?? null;
  }

  const membersQuery = householdId
    ? db.from('family_members').select('id, first_name').eq('household_id', householdId)
    : db.from('family_members').select('id, first_name').eq('user_id', params.userId);
  const factsQuery = householdId
    ? db.from('family_facts').select(FAMILY_FACT_SELECT).eq('household_id', householdId)
    : db.from('family_facts').select(FAMILY_FACT_SELECT).eq('user_id', params.userId);

  const [{ data: members }, { data: rows }] = await Promise.all([membersQuery, factsQuery]);
  return {
    householdId,
    members: ((members ?? []) as FamilyMemberRef[]).map((row) => ({
      id: row.id,
      first_name: row.first_name,
    })),
    facts: ((rows ?? []) as Record<string, unknown>[]).map(mapFamilyFactRow),
  };
}

export async function persistFactRow(db: LooseClient, fact: FamilyFact): Promise<FamilyFact | null> {
  const { data, error } = await db.from('family_facts').insert(rowFromFact(fact)).select(FAMILY_FACT_SELECT).single();
  if (error || !data) {
    console.error('Failed to persist family fact:', error?.message);
    return null;
  }
  return mapFamilyFactRow(data as Record<string, unknown>);
}

export async function persistFactStatus(
  db: LooseClient,
  fact: FamilyFact,
): Promise<void> {
  const { error } = await db
    .from('family_facts')
    .update({
      status: fact.status,
      last_confirmed: fact.last_confirmed,
      superseded_by: fact.superseded_by,
    })
    .eq('id', fact.id);
  if (error) console.error('Failed to update family fact:', error.message);
}

export async function persistSupersedes(db: LooseClient, facts: FamilyFact[]): Promise<void> {
  const superseded = facts.filter((row) => row.status === 'superseded' && row.superseded_by);
  await Promise.all(
    superseded.map((row) =>
      db
        .from('family_facts')
        .update({ status: 'superseded', superseded_by: row.superseded_by })
        .eq('id', row.id),
    ),
  );
}

export async function persistInferredFacts(
  db: LooseClient,
  params: {
    userId: string;
    householdId: string | null;
    members: FamilyMemberRef[];
    existing: FamilyFact[];
    proposed: ProposedFact[];
  },
): Promise<FamilyFact[]> {
  const store: FamilyFactsStore = { facts: params.existing.map((row) => ({ ...row })), seq: 1 };
  const created: FamilyFact[] = [];
  for (const proposal of params.proposed) {
    const result = insertInferredFact(store, proposal, {
      members: params.members,
      user_id: params.userId,
      household_id: params.householdId,
    });
    if (!result.ok) continue;
    const saved = await persistFactRow(db, result.fact);
    if (saved) created.push(saved);
  }
  return created;
}
