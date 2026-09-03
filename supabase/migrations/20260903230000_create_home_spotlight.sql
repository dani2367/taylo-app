CREATE TABLE public.home_spotlight (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items (id) ON DELETE CASCADE,
  reason_text text NOT NULL,
  rank integer NOT NULL,
  is_watching boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX home_spotlight_user_id_idx ON public.home_spotlight (user_id);
CREATE INDEX home_spotlight_user_id_generated_at_idx ON public.home_spotlight (user_id, generated_at DESC);
CREATE INDEX home_spotlight_item_id_idx ON public.home_spotlight (item_id);

ALTER TABLE public.home_spotlight ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own home_spotlight"
  ON public.home_spotlight
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_spotlight TO authenticated;
GRANT ALL ON public.home_spotlight TO service_role;
