export {
  FACT_CONFIDENCE,
  FACT_SOURCES,
  FACT_STATUSES,
  FACT_TYPES,
  FAMILY_FACT_SELECT,
  applyStandingFactsToIntake,
  confirmFact,
  dismissFact,
  emptyFactsStore,
  evidenceKeyFor,
  factsContradict,
  factsPromptBlock,
  factsPromptBlockForPeople,
  inferredSourceStatus,
  insertInferredFact,
  insertManualFact,
  loadHouseholdFacts,
  mapFamilyFactRow,
  pendingFactsForReview,
  persistFactRow,
  persistFactStatus,
  persistInferredFacts,
  persistSupersedes,
  retrieveActiveFactsForPerson,
  rowFromFact,
  similarEvidence,
  type FactConfidence,
  type FactSource,
  type FactStatus,
  type FactType,
  type FamilyFact,
  type FamilyFactsStore,
  type FamilyMemberRef,
  type ManualFactInput,
  type ProposedFact,
} from '../supabase/functions/_shared/family-facts.ts';

import { supabase } from './supabase';
import {
  confirmFact,
  dismissFact,
  insertManualFact,
  emptyFactsStore,
  loadHouseholdFacts,
  persistFactRow,
  persistFactStatus,
  persistSupersedes,
  type FamilyFact,
  type FactType,
} from '../supabase/functions/_shared/family-facts.ts';

export async function loadFamilyKnowledge(userId: string) {
  return loadHouseholdFacts(supabase, { userId });
}

export async function saveManualFamilyFact(params: {
  userId: string;
  householdId: string | null;
  personId: string | null;
  factType: FactType;
  content: string;
  existing: FamilyFact[];
}): Promise<FamilyFact | null> {
  const store = emptyFactsStore();
  store.facts = params.existing.map((row) => ({ ...row }));
  const fact = insertManualFact(
    store,
    { person_id: params.personId, fact_type: params.factType, content: params.content },
    {
      user_id: params.userId,
      household_id: params.householdId,
      id: crypto.randomUUID(),
    },
  );
  const saved = await persistFactRow(supabase, fact);
  if (saved) await persistSupersedes(supabase, store.facts);
  return saved;
}

export async function confirmFamilyFact(params: {
  fact: FamilyFact;
  existing: FamilyFact[];
}): Promise<FamilyFact | null> {
  const store = emptyFactsStore();
  store.facts = params.existing.map((row) => ({ ...row }));
  const updated = confirmFact(store, params.fact.id);
  if (!updated) return null;
  await persistFactStatus(supabase, updated);
  await persistSupersedes(supabase, store.facts);
  return updated;
}

export async function dismissFamilyFact(params: { fact: FamilyFact; existing: FamilyFact[] }): Promise<FamilyFact | null> {
  const store = emptyFactsStore();
  store.facts = params.existing.map((row) => ({ ...row }));
  const updated = dismissFact(store, params.fact.id);
  if (!updated) return null;
  await persistFactStatus(supabase, updated);
  return updated;
}
