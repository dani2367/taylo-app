CREATE TABLE public.family_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  subject text NOT NULL,
  fact text NOT NULL,
  category text NOT NULL CHECK (
    category IN ('school', 'medical', 'preference', 'routine', 'relationship', 'other')
  ),
  source text NOT NULL CHECK (source IN ('manual', 'inferred')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX family_facts_user_id_idx ON public.family_facts (user_id);

ALTER TABLE public.family_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own family_facts"
  ON public.family_facts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_facts TO authenticated;
GRANT ALL ON public.family_facts TO service_role;
