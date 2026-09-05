CREATE TABLE public.home_noticed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  insight_text text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX home_noticed_user_id_generated_at_idx ON public.home_noticed (user_id, generated_at DESC);

ALTER TABLE public.home_noticed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own home_noticed"
  ON public.home_noticed
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_noticed TO authenticated;
GRANT ALL ON public.home_noticed TO service_role;
