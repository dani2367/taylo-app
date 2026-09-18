-- Age/date-triggered family-admin checks. Catalog is global; items remain the surface.
-- window_unit includes hours for the newborn physical exam (0–72h). Family DOB is a date
-- not a time, so age-in-hours is days-since-birth * 24 (midnight-to-midnight buckets).

CREATE TABLE public.action_library (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'England',
  trigger_type text NOT NULL,
  window_start numeric,
  window_end numeric,
  window_unit text,
  lead_window_days integer NOT NULL DEFAULT 7,
  check_type text NOT NULL,
  action_description text NOT NULL,
  source text NOT NULL,
  source_url text,
  last_verified date,
  needs_verification boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT action_library_category_check CHECK (
    category IN ('vaccination', 'health_review', 'newborn', 'administration', 'childcare', 'education')
  ),
  CONSTRAINT action_library_trigger_type_check CHECK (
    trigger_type IN ('child_age', 'birth_date', 'child_age_and_term', 'school_year')
  ),
  CONSTRAINT action_library_window_unit_check CHECK (
    window_unit IS NULL OR window_unit IN ('hours', 'days', 'weeks', 'months')
  ),
  CONSTRAINT action_library_check_type_check CHECK (
    check_type IN ('calendar', 'family_fact', 'user_confirmation')
  )
);

CREATE INDEX action_library_active_idx
  ON public.action_library (active)
  WHERE active;

ALTER TABLE public.action_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read action_library"
  ON public.action_library
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.action_library TO authenticated;
GRANT ALL ON public.action_library TO service_role;

CREATE TABLE public.term_dates (
  id text PRIMARY KEY,
  term_name text NOT NULL,
  term_start_date date NOT NULL,
  application_deadline date,
  effective_from date,
  effective_to date,
  jurisdiction text NOT NULL DEFAULT 'England'
);

CREATE INDEX term_dates_jurisdiction_start_idx
  ON public.term_dates (jurisdiction, term_start_date);

ALTER TABLE public.term_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read term_dates"
  ON public.term_dates
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.term_dates TO authenticated;
GRANT ALL ON public.term_dates TO service_role;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS action_library_id text REFERENCES public.action_library (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_action_library_id_idx
  ON public.items (action_library_id)
  WHERE action_library_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS items_household_action_library_child_idx
  ON public.items (household_id, action_library_id, lower(btrim(who_it_affects)))
  WHERE action_library_id IS NOT NULL
    AND household_id IS NOT NULL
    AND who_it_affects IS NOT NULL;

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_source_check;
ALTER TABLE public.items
  ADD CONSTRAINT items_source_check
  CHECK (source IN ('email', 'chat', 'manual', 'calendar', 'action_library'));

ALTER TABLE public.family_facts DROP CONSTRAINT IF EXISTS family_facts_source_check;
ALTER TABLE public.family_facts
  ADD CONSTRAINT family_facts_source_check CHECK (
    source IN (
      'manual',
      'inferred_email',
      'inferred_chat',
      'inferred_behavior',
      'inferred',
      'user_confirmation'
    )
  );

INSERT INTO public.action_library (
  id, name, category, jurisdiction, trigger_type,
  window_start, window_end, window_unit, lead_window_days,
  check_type, action_description, source, source_url,
  last_verified, needs_verification, active
) VALUES
  (
    'birth-registration-england',
    'Birth registration',
    'administration',
    'England',
    'birth_date',
    0, 42, 'days', 0,
    'family_fact',
    'Register the child''s birth within the applicable statutory period.',
    'GOV.UK',
    'https://www.gov.uk/register-birth',
    NULL, false, true
  ),
  (
    'newborn-physical-examination',
    'Newborn physical examination',
    'newborn',
    'England',
    'birth_date',
    0, 72, 'hours', 0,
    'family_fact',
    'Check that the newborn physical examination has been completed.',
    'NHS',
    'https://www.nhs.uk/baby/newborn-screening/physical-examination/',
    NULL, false, true
  ),
  (
    'newborn-blood-spot',
    'Newborn blood spot screening',
    'newborn',
    'England',
    'birth_date',
    5, 8, 'days', 2,
    'family_fact',
    'Check that the newborn blood spot screening test has been completed or arranged.',
    'NHS',
    'https://www.nhs.uk/baby/newborn-screening/',
    NULL, false, true
  ),
  (
    'newborn-hearing-screen',
    'Newborn hearing screening',
    'newborn',
    'England',
    'birth_date',
    0, 42, 'days', 0,
    'family_fact',
    'Check that the newborn hearing screening has been completed or arranged.',
    'NHS',
    'https://www.nhs.uk/baby/newborn-screening/',
    NULL, false, true
  ),
  (
    'six-eight-week-health-review',
    '6–8 week health review',
    'health_review',
    'England',
    'child_age',
    6, 8, 'weeks', 14,
    'calendar',
    'Check whether your baby''s 6–8 week health review has been booked or completed.',
    'NHS',
    'https://www.nhs.uk/baby/babys-development/height-weight-and-reviews/baby-reviews/',
    NULL, false, true
  ),
  (
    'vaccination-check-8-weeks',
    'Routine vaccination check',
    'vaccination',
    'England',
    'child_age',
    8, 9, 'weeks', 7,
    'user_confirmation',
    'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    'NHS',
    'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    NULL, false, true
  ),
  (
    'vaccination-check-12-weeks',
    'Routine vaccination check',
    'vaccination',
    'England',
    'child_age',
    12, 13, 'weeks', 7,
    'user_confirmation',
    'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    'NHS',
    'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    NULL, false, true
  ),
  (
    'vaccination-check-16-weeks',
    'Routine vaccination check',
    'vaccination',
    'England',
    'child_age',
    16, 17, 'weeks', 7,
    'user_confirmation',
    'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    'NHS',
    'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    NULL, false, true
  ),
  (
    'vaccination-check-12-months',
    'Routine vaccination check',
    'vaccination',
    'England',
    'child_age',
    12, 13, 'months', 14,
    'user_confirmation',
    'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    'NHS',
    'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    NULL, false, true
  ),
  (
    'vaccination-check-18-months',
    'Routine vaccination check',
    'vaccination',
    'England',
    'child_age',
    18, 19, 'months', 14,
    'user_confirmation',
    'Check whether your child is due any routine vaccinations at this age. Your GP or health visitor can confirm the current schedule.',
    'NHS',
    'https://www.nhs.uk/vaccinations/nhs-vaccinations-and-when-to-have-them/',
    NULL, false, true
  ),
  (
    'nine-twelve-month-health-review',
    '9–12 month health review',
    'health_review',
    'England',
    'child_age',
    9, 12, 'months', 28,
    'calendar',
    'Check whether your child''s 9–12 month health and development review has been offered or completed.',
    'NHS',
    'https://www.nhs.uk/baby/babys-development/height-weight-and-reviews/baby-reviews/',
    NULL, false, true
  ),
  (
    'two-year-health-review',
    '2–2½ year health review',
    'health_review',
    'England',
    'child_age',
    24, 30, 'months', 28,
    'calendar',
    'Check whether your child''s 2–2½ year health and development review has been offered or completed.',
    'NHS',
    'https://www.nhs.uk/baby/babys-development/height-weight-and-reviews/baby-reviews/',
    NULL, false, true
  ),
  (
    'childcare-30-hours-from-9-months',
    '30 hours funded childcare from 9 months',
    'childcare',
    'England',
    'child_age_and_term',
    9, NULL, 'months', 42,
    'family_fact',
    'Check whether your family is eligible for funded childcare and whether an application is needed for the upcoming term.',
    'GOV.UK',
    'https://www.gov.uk/free-childcare-if-working/when-to-apply',
    NULL, true, false
  ),
  (
    'childcare-15-hours-from-3',
    'Universal 15 hours from age 3',
    'childcare',
    'England',
    'child_age_and_term',
    36, NULL, 'months', 42,
    'family_fact',
    'Check the funded childcare entitlement available for your child from the relevant term after their third birthday.',
    'GOV.UK',
    'https://www.gov.uk/30-hours-free-childcare',
    NULL, true, false
  ),
  (
    'primary-school-application',
    'Primary school application',
    'education',
    'England',
    'school_year',
    NULL, NULL, NULL, 42,
    'family_fact',
    'Check whether a primary school application is needed for the relevant admissions year.',
    'GOV.UK',
    'https://www.gov.uk/apply-for-primary-school-place',
    NULL, true, false
  ),
  (
    'secondary-school-application',
    'Secondary school application',
    'education',
    'England',
    'school_year',
    NULL, NULL, NULL, 42,
    'family_fact',
    'Check whether a secondary school application is needed for the relevant admissions year.',
    'GOV.UK',
    'https://www.gov.uk/apply-for-secondary-school-place',
    NULL, true, false
  ),
  (
    'primary-school-offer-day',
    'Primary school offer day',
    'education',
    'England',
    'school_year',
    NULL, NULL, NULL, 14,
    'calendar',
    'Check primary school offer day for the relevant admissions year.',
    'GOV.UK',
    'https://www.gov.uk/apply-for-primary-school-place',
    NULL, true, false
  ),
  (
    'secondary-school-offer-day',
    'Secondary school offer day',
    'education',
    'England',
    'school_year',
    NULL, NULL, NULL, 14,
    'calendar',
    'Check secondary school offer day for the relevant admissions year.',
    'GOV.UK',
    'https://www.gov.uk/apply-for-secondary-school-place',
    NULL, true, false
  );
