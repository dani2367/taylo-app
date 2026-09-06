-- Calendar-sourced items: stable external ids for upsert, plus selected device calendars on the Apple connection.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS calendar_provider text;

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_source_check;
ALTER TABLE public.items
  ADD CONSTRAINT items_source_check
  CHECK (source IN ('email', 'chat', 'manual', 'calendar'));

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_user_external_key;
ALTER TABLE public.items
  ADD CONSTRAINT items_user_external_key
  UNIQUE (user_id, external_source, external_id);

CREATE INDEX IF NOT EXISTS items_user_external_source_idx
  ON public.items (user_id, external_source)
  WHERE external_source IS NOT NULL;

ALTER TABLE public.items
  ALTER COLUMN event_date TYPE timestamp without time zone
  USING event_date::timestamp;

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS selected_calendar_ids text[] NOT NULL DEFAULT '{}';
