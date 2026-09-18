-- Extend existing family_facts into a household knowledge base.
-- Keep subject/fact/category for chat/noticed/spotlight readers; dual-write content.

ALTER TABLE public.family_facts
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households (id),
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.family_members (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fact_type text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.family_facts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_observed timestamptz,
  ADD COLUMN IF NOT EXISTS last_confirmed timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_key text,
  ADD COLUMN IF NOT EXISTS evidence text;

UPDATE public.family_facts
SET
  content = COALESCE(NULLIF(trim(content), ''), fact),
  fact_type = COALESCE(
    fact_type,
    CASE
      WHEN lower(trim(subject)) IN ('family', 'household', 'everyone', 'whole family')
        THEN 'household_pattern'
      ELSE 'person_attribute'
    END
  ),
  confidence = COALESCE(confidence, 'high'),
  status = COALESCE(status, 'active'),
  first_observed = COALESCE(first_observed, created_at),
  last_confirmed = COALESCE(last_confirmed, created_at),
  evidence_key = COALESCE(
    evidence_key,
    lower(regexp_replace(trim(fact), '[^a-z0-9]+', ' ', 'g'))
  )
WHERE content IS NULL
   OR fact_type IS NULL
   OR confidence IS NULL
   OR status IS NULL
   OR first_observed IS NULL
   OR evidence_key IS NULL;

UPDATE public.family_facts AS ff
SET household_id = m.household_id
FROM public.household_members AS m
WHERE m.user_id = ff.user_id
  AND ff.household_id IS NULL;

ALTER TABLE public.family_facts DROP CONSTRAINT IF EXISTS family_facts_source_check;
UPDATE public.family_facts SET source = 'inferred_email' WHERE source = 'inferred';
ALTER TABLE public.family_facts
  ADD CONSTRAINT family_facts_source_check CHECK (
    source IN ('manual', 'inferred_email', 'inferred_chat', 'inferred_behavior', 'inferred')
  );

ALTER TABLE public.family_facts DROP CONSTRAINT IF EXISTS family_facts_fact_type_check;
ALTER TABLE public.family_facts
  ADD CONSTRAINT family_facts_fact_type_check CHECK (
    fact_type IN ('person_attribute', 'household_pattern')
  );

ALTER TABLE public.family_facts DROP CONSTRAINT IF EXISTS family_facts_confidence_check;
ALTER TABLE public.family_facts
  ADD CONSTRAINT family_facts_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low')
  );

ALTER TABLE public.family_facts DROP CONSTRAINT IF EXISTS family_facts_status_check;
ALTER TABLE public.family_facts
  ADD CONSTRAINT family_facts_status_check CHECK (
    status IN ('active', 'pending_review', 'rejected', 'superseded')
  );

ALTER TABLE public.family_facts
  ALTER COLUMN fact_type SET NOT NULL,
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN confidence SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN first_observed SET NOT NULL;

CREATE INDEX IF NOT EXISTS family_facts_household_status_idx
  ON public.family_facts (household_id, status);
CREATE INDEX IF NOT EXISTS family_facts_person_id_idx
  ON public.family_facts (person_id);
CREATE INDEX IF NOT EXISTS family_facts_evidence_key_idx
  ON public.family_facts (household_id, evidence_key);

CREATE OR REPLACE FUNCTION private.set_family_fact_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    NEW.household_id := private.household_id_for_user(NEW.user_id);
  END IF;
  IF NEW.content IS NULL OR btrim(NEW.content) = '' THEN
    NEW.content := NEW.fact;
  END IF;
  IF NEW.fact IS NULL OR btrim(NEW.fact) = '' THEN
    NEW.fact := NEW.content;
  END IF;
  IF NEW.subject IS NULL OR btrim(NEW.subject) = '' THEN
    NEW.subject := 'household';
  END IF;
  IF NEW.first_observed IS NULL THEN
    NEW.first_observed := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_family_fact_household ON public.family_facts;
CREATE TRIGGER set_family_fact_household
BEFORE INSERT OR UPDATE ON public.family_facts
FOR EACH ROW
EXECUTE FUNCTION private.set_family_fact_household();

DROP POLICY IF EXISTS "own family_facts" ON public.family_facts;

DROP POLICY IF EXISTS "select household family_facts" ON public.family_facts;
CREATE POLICY "select household family_facts"
  ON public.family_facts
  FOR SELECT
  TO authenticated
  USING (household_id = public.current_household_id());

DROP POLICY IF EXISTS "insert household family_facts" ON public.family_facts;
CREATE POLICY "insert household family_facts"
  ON public.family_facts
  FOR INSERT
  TO authenticated
  WITH CHECK (household_id = public.current_household_id());

DROP POLICY IF EXISTS "update household family_facts" ON public.family_facts;
CREATE POLICY "update household family_facts"
  ON public.family_facts
  FOR UPDATE
  TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());

DROP POLICY IF EXISTS "delete household family_facts" ON public.family_facts;
CREATE POLICY "delete household family_facts"
  ON public.family_facts
  FOR DELETE
  TO authenticated
  USING (household_id = public.current_household_id());
