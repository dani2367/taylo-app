-- Household General to do, same sharing model as Shopping. Named lists stay private until shared.

CREATE OR REPLACE FUNCTION private.set_collection_visibility_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    NEW.household_id := private.household_id_for_user(NEW.user_id);
  END IF;
  IF NEW.visibility IS NULL OR NEW.visibility = '' THEN
    NEW.visibility := 'private';
  END IF;
  IF NEW.type IN ('shopping', 'todo')
    OR lower(btrim(NEW.title)) IN ('general to do', 'shopping') THEN
    NEW.visibility := 'shared';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.household_id IS NOT NULL THEN
      NEW.household_id := OLD.household_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.collections
SET visibility = 'shared'
WHERE type IN ('shopping', 'todo')
   OR lower(btrim(title)) IN ('general to do', 'shopping');

CREATE OR REPLACE FUNCTION public.find_or_create_todo_collection(p_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  hid uuid;
  cid uuid;
BEGIN
  uid := COALESCE(p_user_id, auth.uid());
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.role() = 'authenticated' AND uid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  hid := private.household_id_for_user(uid);

  SELECT id INTO cid
  FROM public.collections
  WHERE status = 'active'
    AND household_id = hid
    AND (type = 'todo' OR lower(btrim(title)) = 'general to do')
  ORDER BY created_at ASC
  LIMIT 1;

  IF cid IS NOT NULL THEN
    UPDATE public.collections
    SET visibility = 'shared',
        household_id = hid,
        type = CASE WHEN type = 'custom' THEN 'todo' ELSE type END
    WHERE id = cid;
    RETURN cid;
  END IF;

  INSERT INTO public.collections (user_id, title, emoji, type, status, household_id, visibility)
  VALUES (uid, 'General to do', '📝', 'todo', 'active', hid, 'shared')
  RETURNING id INTO cid;

  RETURN cid;
END;
$$;

DROP INDEX IF EXISTS collections_one_active_household_todo_idx;
CREATE UNIQUE INDEX collections_one_active_household_todo_idx
  ON public.collections (household_id)
  WHERE status = 'active'
    AND household_id IS NOT NULL
    AND (type = 'todo' OR lower(btrim(title)) = 'general to do');
