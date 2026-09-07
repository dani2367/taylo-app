CREATE TABLE public.family_week_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  week_start date NOT NULL,
  fingerprint text NOT NULL,
  summaries jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX family_week_cache_user_id_generated_at_idx ON public.family_week_cache (user_id, generated_at DESC);

ALTER TABLE public.family_week_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own family_week_cache"
  ON public.family_week_cache
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_week_cache TO authenticated;
GRANT ALL ON public.family_week_cache TO service_role;

CREATE TABLE public.schedule_density_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  insight_text text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX schedule_density_cache_user_id_generated_at_idx ON public.schedule_density_cache (user_id, generated_at DESC);

ALTER TABLE public.schedule_density_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own schedule_density_cache"
  ON public.schedule_density_cache
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_density_cache TO authenticated;
GRANT ALL ON public.schedule_density_cache TO service_role;
