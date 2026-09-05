ALTER TABLE public.collections DROP CONSTRAINT collections_type_check;
ALTER TABLE public.collections
  ADD CONSTRAINT collections_type_check
  CHECK (type IN ('shopping', 'event', 'trip', 'other', 'custom', 'todo'));

CREATE UNIQUE INDEX IF NOT EXISTS collections_one_active_todo_idx
  ON public.collections (user_id)
  WHERE type = 'todo' AND status = 'active';

CREATE OR REPLACE FUNCTION public.find_or_create_todo_collection(p_user_id uuid DEFAULT NULL)
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
    AND type = 'todo'
    AND status = 'active'
  LIMIT 1;

  IF cid IS NOT NULL THEN
    RETURN cid;
  END IF;

  INSERT INTO public.collections (user_id, title, emoji, type, status)
  VALUES (uid, 'General to do', '📝', 'todo', 'active')
  ON CONFLICT (user_id) WHERE type = 'todo' AND status = 'active'
  DO NOTHING
  RETURNING id INTO cid;

  IF cid IS NULL THEN
    SELECT id INTO cid
    FROM public.collections
    WHERE user_id = uid
      AND type = 'todo'
      AND status = 'active'
    LIMIT 1;
  END IF;

  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.find_or_create_todo_collection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_create_todo_collection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_todo_collection(uuid) TO service_role;
