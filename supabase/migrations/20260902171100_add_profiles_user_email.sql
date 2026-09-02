CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_email text;

CREATE OR REPLACE FUNCTION private.set_profile_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT au.email INTO NEW.user_email
  FROM auth.users AS au
  WHERE au.id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_user_email ON public.profiles;

CREATE TRIGGER set_profile_user_email
BEFORE INSERT OR UPDATE OF id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.set_profile_user_email();

UPDATE public.profiles AS p
SET user_email = au.email
FROM auth.users AS au
WHERE au.id = p.id;
