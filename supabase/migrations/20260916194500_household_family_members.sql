-- Children belong to the household so both parents see Taya/Arlo.

ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households (id);

CREATE INDEX IF NOT EXISTS family_members_household_id_idx ON public.family_members (household_id);

CREATE OR REPLACE FUNCTION private.set_family_member_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    NEW.household_id := private.household_id_for_user(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_family_member_household ON public.family_members;
CREATE TRIGGER set_family_member_household
BEFORE INSERT OR UPDATE ON public.family_members
FOR EACH ROW
EXECUTE FUNCTION private.set_family_member_household();

UPDATE public.family_members AS fm
SET household_id = m.household_id
FROM public.household_members AS m
WHERE m.user_id = fm.user_id
  AND fm.household_id IS NULL;

DROP POLICY IF EXISTS "select household children" ON public.family_members;
CREATE POLICY "select household children"
  ON public.family_members
  FOR SELECT
  TO authenticated
  USING (
    role = 'child'
    AND household_id = public.current_household_id()
  );

DROP POLICY IF EXISTS "update household children" ON public.family_members;
CREATE POLICY "update household children"
  ON public.family_members
  FOR UPDATE
  TO authenticated
  USING (
    role = 'child'
    AND household_id = public.current_household_id()
  )
  WITH CHECK (
    role = 'child'
    AND household_id = public.current_household_id()
  );
