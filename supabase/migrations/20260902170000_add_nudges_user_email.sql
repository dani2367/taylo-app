CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.nudges
  ADD COLUMN IF NOT EXISTS user_email text;

CREATE OR REPLACE FUNCTION private.set_nudge_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT au.email INTO NEW.user_email
  FROM auth.users AS au
  WHERE au.id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_nudge_user_email ON public.nudges;

CREATE TRIGGER set_nudge_user_email
BEFORE INSERT OR UPDATE OF user_id ON public.nudges
FOR EACH ROW
EXECUTE FUNCTION private.set_nudge_user_email();

UPDATE public.nudges AS n
SET user_email = au.email
FROM auth.users AS au
WHERE au.id = n.user_id;
