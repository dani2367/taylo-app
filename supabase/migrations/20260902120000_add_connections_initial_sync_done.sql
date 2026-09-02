ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS initial_sync_done boolean DEFAULT false;

UPDATE public.connections
SET initial_sync_done = false
WHERE initial_sync_done IS NULL;

ALTER TABLE public.connections
  ALTER COLUMN initial_sync_done SET DEFAULT false;

ALTER TABLE public.connections
  ALTER COLUMN initial_sync_done SET NOT NULL;
