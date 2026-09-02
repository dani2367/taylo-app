CREATE TABLE public.source_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  nudge_id uuid REFERENCES public.nudges (id) ON DELETE SET NULL,
  subject text,
  sender text,
  body_text text,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX source_emails_user_id_idx ON public.source_emails (user_id);
CREATE INDEX source_emails_nudge_id_idx ON public.source_emails (nudge_id);

ALTER TABLE public.source_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own source_emails"
  ON public.source_emails
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_emails TO authenticated;
GRANT ALL ON public.source_emails TO service_role;
