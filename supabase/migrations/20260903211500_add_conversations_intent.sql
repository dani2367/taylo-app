ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS intent text;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_intent_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_intent_check
  CHECK (intent IS NULL OR intent IN ('ask', 'offload'));
