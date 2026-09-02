ALTER TABLE public.nudges
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'email';

ALTER TABLE public.nudges
  DROP CONSTRAINT IF EXISTS nudges_source_check;

ALTER TABLE public.nudges
  ADD CONSTRAINT nudges_source_check CHECK (source IN ('email', 'chat'));
