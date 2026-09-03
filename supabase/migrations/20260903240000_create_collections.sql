CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  emoji text,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collections_type_check CHECK (type IN ('shopping', 'event', 'trip', 'other')),
  CONSTRAINT collections_status_check CHECK (status IN ('active', 'completed'))
);

CREATE INDEX collections_user_id_idx ON public.collections (user_id);
CREATE INDEX collections_user_id_status_idx ON public.collections (user_id, status);

CREATE UNIQUE INDEX collections_one_active_shopping_idx
  ON public.collections (user_id)
  WHERE type = 'shopping' AND status = 'active';

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own collections"
  ON public.collections
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;

ALTER TABLE public.items
  ADD COLUMN collection_id uuid REFERENCES public.collections (id) ON DELETE SET NULL;

CREATE INDEX items_collection_id_idx ON public.items (collection_id);

CREATE OR REPLACE FUNCTION private.sync_collection_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[] := ARRAY[]::uuid[];
  cid uuid;
  remaining_open integer;
  item_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.collection_id IS NOT NULL THEN
      ids := array_append(ids, OLD.collection_id);
    END IF;
  ELSE
    IF NEW.collection_id IS NOT NULL THEN
      ids := array_append(ids, NEW.collection_id);
    END IF;
    IF TG_OP = 'UPDATE'
      AND OLD.collection_id IS DISTINCT FROM NEW.collection_id
      AND OLD.collection_id IS NOT NULL THEN
      ids := array_append(ids, OLD.collection_id);
    END IF;
  END IF;

  FOREACH cid IN ARRAY ids LOOP
    SELECT
      count(*) FILTER (WHERE status = 'open'),
      count(*)
    INTO remaining_open, item_count
    FROM public.items
    WHERE collection_id = cid;

    IF item_count > 0 AND remaining_open = 0 THEN
      UPDATE public.collections
      SET status = 'completed'
      WHERE id = cid AND status <> 'completed';
    ELSIF remaining_open > 0 THEN
      UPDATE public.collections
      SET status = 'active'
      WHERE id = cid AND status <> 'active';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_sync_collection_status
AFTER INSERT OR UPDATE OF status, collection_id OR DELETE ON public.items
FOR EACH ROW
EXECUTE FUNCTION private.sync_collection_status();

CREATE OR REPLACE FUNCTION public.find_or_create_shopping_collection(p_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  cid uuid;
BEGIN
  uid := COALESCE(p_user_id, auth.uid());
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.role() = 'authenticated' AND uid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT id INTO cid
  FROM public.collections
  WHERE user_id = uid
    AND type = 'shopping'
    AND status = 'active'
  LIMIT 1;

  IF cid IS NOT NULL THEN
    RETURN cid;
  END IF;

  INSERT INTO public.collections (user_id, title, emoji, type, status)
  VALUES (uid, 'Shopping', '🛒', 'shopping', 'active')
  ON CONFLICT (user_id) WHERE type = 'shopping' AND status = 'active'
  DO NOTHING
  RETURNING id INTO cid;

  IF cid IS NULL THEN
    SELECT id INTO cid
    FROM public.collections
    WHERE user_id = uid
      AND type = 'shopping'
      AND status = 'active'
    LIMIT 1;
  END IF;

  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.find_or_create_shopping_collection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_create_shopping_collection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_shopping_collection(uuid) TO service_role;
