ALTER TABLE public.collections DROP CONSTRAINT collections_type_check;
ALTER TABLE public.collections
  ADD CONSTRAINT collections_type_check
  CHECK (type IN ('shopping', 'event', 'trip', 'other', 'custom'));
