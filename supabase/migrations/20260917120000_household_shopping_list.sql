-- Household shopping list: one shared Shopping collection per household.

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households (id),
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_visibility_check;

ALTER TABLE public.collections
  ADD CONSTRAINT collections_visibility_check CHECK (visibility IN ('private', 'shared'));

CREATE INDEX IF NOT EXISTS collections_household_id_visibility_idx
  ON public.collections (household_id, visibility);

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
  IF NEW.type = 'shopping' THEN
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

DROP TRIGGER IF EXISTS set_collection_visibility_defaults ON public.collections;
CREATE TRIGGER set_collection_visibility_defaults
BEFORE INSERT OR UPDATE ON public.collections
FOR EACH ROW
EXECUTE FUNCTION private.set_collection_visibility_defaults();

UPDATE public.collections AS c
SET household_id = COALESCE(c.household_id, m.household_id)
FROM public.household_members AS m
WHERE m.user_id = c.user_id
  AND c.household_id IS NULL;

UPDATE public.collections
SET visibility = 'shared'
WHERE type = 'shopping';

UPDATE public.items AS i
SET
  visibility = 'shared',
  who_it_affects = COALESCE(NULLIF(btrim(i.who_it_affects), ''), 'family')
FROM public.collections AS c
WHERE c.id = i.collection_id
  AND c.type = 'shopping'
  AND i.visibility = 'private';

UPDATE public.items AS child
SET visibility = 'shared'
FROM public.items AS parent
WHERE child.parent_id = parent.id
  AND parent.visibility = 'shared'
  AND child.visibility = 'private'
  AND parent.collection_id IS NOT NULL;

DROP POLICY IF EXISTS "own collections" ON public.collections;

DROP POLICY IF EXISTS "select visible collections" ON public.collections;
CREATE POLICY "select visible collections"
  ON public.collections
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (
      visibility = 'shared'
      AND household_id = public.current_household_id()
    )
  );

DROP POLICY IF EXISTS "insert own collections" ON public.collections;
CREATE POLICY "insert own collections"
  ON public.collections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND household_id = public.current_household_id()
  );

DROP POLICY IF EXISTS "update visible collections" ON public.collections;
CREATE POLICY "update visible collections"
  ON public.collections
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (
      visibility = 'shared'
      AND household_id = public.current_household_id()
    )
  )
  WITH CHECK (
    household_id = public.current_household_id()
    AND (
      user_id = (SELECT auth.uid())
      OR visibility = 'shared'
    )
  );

DROP POLICY IF EXISTS "delete own collections" ON public.collections;
CREATE POLICY "delete own collections"
  ON public.collections
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.find_or_create_shopping_collection(p_user_id uuid DEFAULT NULL)
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
  WHERE type = 'shopping'
    AND status = 'active'
    AND household_id = hid
  ORDER BY created_at ASC
  LIMIT 1;

  IF cid IS NOT NULL THEN
    UPDATE public.collections
    SET visibility = 'shared', household_id = hid
    WHERE id = cid;
    RETURN cid;
  END IF;

  INSERT INTO public.collections (user_id, title, emoji, type, status, household_id, visibility)
  VALUES (uid, 'Shopping', '🛒', 'shopping', 'active', hid, 'shared')
  RETURNING id INTO cid;

  RETURN cid;
END;
$$;

DROP INDEX IF EXISTS collections_one_active_household_shopping_idx;
CREATE UNIQUE INDEX collections_one_active_household_shopping_idx
  ON public.collections (household_id)
  WHERE type = 'shopping' AND status = 'active' AND household_id IS NOT NULL;
