-- Household membership + private-by-default item visibility (Phase 8).
-- Sharing flips visibility only; it does not assign responsibility.

CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.household_members (
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id),
  CONSTRAINT household_members_user_id_key UNIQUE (user_id)
);

CREATE INDEX household_members_user_id_idx ON public.household_members (user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households (id);

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households (id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id),
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_visibility_check;

ALTER TABLE public.items
  ADD CONSTRAINT items_visibility_check CHECK (visibility IN ('private', 'shared'));

CREATE INDEX IF NOT EXISTS items_household_id_visibility_idx ON public.items (household_id, visibility);
CREATE INDEX IF NOT EXISTS items_created_by_idx ON public.items (created_by);

CREATE OR REPLACE FUNCTION public.current_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_household_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_household_id() TO service_role;

CREATE OR REPLACE FUNCTION private.household_id_for_user(uid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hid uuid;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT household_id INTO hid
  FROM public.household_members
  WHERE user_id = uid
  LIMIT 1;

  IF hid IS NOT NULL THEN
    RETURN hid;
  END IF;

  INSERT INTO public.households DEFAULT VALUES RETURNING id INTO hid;
  INSERT INTO public.household_members (household_id, user_id)
  VALUES (hid, uid)
  ON CONFLICT (user_id) DO UPDATE SET household_id = public.household_members.household_id
  RETURNING household_id INTO hid;

  UPDATE public.profiles
  SET household_id = hid
  WHERE id = uid AND (household_id IS NULL OR household_id IS DISTINCT FROM hid);

  RETURN hid;
END;
$$;

CREATE OR REPLACE FUNCTION private.set_item_visibility_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := NEW.user_id;
  END IF;
  IF NEW.visibility IS NULL OR NEW.visibility = '' THEN
    NEW.visibility := 'private';
  END IF;
  IF NEW.household_id IS NULL THEN
    NEW.household_id := private.household_id_for_user(NEW.user_id);
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.created_by IS NOT NULL THEN
      NEW.created_by := OLD.created_by;
    END IF;
    IF OLD.household_id IS NOT NULL THEN
      NEW.household_id := OLD.household_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_item_visibility_defaults ON public.items;
CREATE TRIGGER set_item_visibility_defaults
BEFORE INSERT OR UPDATE ON public.items
FOR EACH ROW
EXECUTE FUNCTION private.set_item_visibility_defaults();

CREATE OR REPLACE FUNCTION private.ensure_profile_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.household_id := COALESCE(NEW.household_id, private.household_id_for_user(NEW.id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_profile_household ON public.profiles;
CREATE TRIGGER ensure_profile_household
BEFORE INSERT OR UPDATE OF id, household_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.ensure_profile_household();

DO $$
DECLARE
  uid uuid;
BEGIN
  FOR uid IN
    SELECT DISTINCT src.id
    FROM (
      SELECT id FROM public.profiles
      UNION
      SELECT user_id FROM public.items
    ) AS src
    WHERE NOT EXISTS (
      SELECT 1 FROM public.household_members m WHERE m.user_id = src.id
    )
  LOOP
    PERFORM private.household_id_for_user(uid);
  END LOOP;
END $$;

UPDATE public.items AS i
SET
  created_by = COALESCE(i.created_by, i.user_id),
  household_id = COALESCE(i.household_id, m.household_id),
  visibility = COALESCE(NULLIF(i.visibility, ''), 'private')
FROM public.household_members AS m
WHERE m.user_id = i.user_id;

DO $$
DECLARE
  uid uuid;
BEGIN
  FOR uid IN SELECT DISTINCT user_id FROM public.items WHERE household_id IS NULL
  LOOP
    UPDATE public.items
    SET household_id = private.household_id_for_user(uid)
    WHERE user_id = uid AND household_id IS NULL;
  END LOOP;
END $$;

UPDATE public.items
SET created_by = user_id
WHERE created_by IS NULL;

ALTER TABLE public.items
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN household_id SET NOT NULL;

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.households TO authenticated;
GRANT SELECT, INSERT ON public.household_members TO authenticated;
GRANT ALL ON public.households TO service_role;
GRANT ALL ON public.household_members TO service_role;

DROP POLICY IF EXISTS "read own household" ON public.households;
CREATE POLICY "read own household"
  ON public.households
  FOR SELECT
  TO authenticated
  USING (id = public.current_household_id());

DROP POLICY IF EXISTS "create household" ON public.households;
CREATE POLICY "create household"
  ON public.households
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "read household membership" ON public.household_members;
CREATE POLICY "read household membership"
  ON public.household_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR household_id = public.current_household_id()
  );

DROP POLICY IF EXISTS "join own household" ON public.household_members;
CREATE POLICY "join own household"
  ON public.household_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "own items" ON public.items;

DROP POLICY IF EXISTS "select visible items" ON public.items;
CREATE POLICY "select visible items"
  ON public.items
  FOR SELECT
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (
      visibility = 'shared'
      AND household_id = public.current_household_id()
    )
  );

DROP POLICY IF EXISTS "insert own items" ON public.items;
CREATE POLICY "insert own items"
  ON public.items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
    AND household_id = public.current_household_id()
  );

DROP POLICY IF EXISTS "update visible items" ON public.items;
CREATE POLICY "update visible items"
  ON public.items
  FOR UPDATE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (
      visibility = 'shared'
      AND household_id = public.current_household_id()
    )
  )
  WITH CHECK (
    household_id = public.current_household_id()
    AND (
      created_by = (SELECT auth.uid())
      OR visibility = 'shared'
    )
  );

DROP POLICY IF EXISTS "delete own items" ON public.items;
CREATE POLICY "delete own items"
  ON public.items
  FOR DELETE
  TO authenticated
  USING (created_by = (SELECT auth.uid()));
