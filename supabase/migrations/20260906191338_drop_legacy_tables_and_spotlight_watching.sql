-- Old Today/Ahead tables: data was copied into public.items; app no longer reads these.
DROP TABLE IF EXISTS public.ahead_items;
DROP TABLE IF EXISTS public.nudges;

-- Spotlight watching rows were never shown on Home.
ALTER TABLE public.home_spotlight DROP COLUMN IF EXISTS is_watching;
