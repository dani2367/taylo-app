-- Activate GOV.UK-verified childcare and school-year actions.
-- Term rows follow the repeating England funded-childcare calendar (1 Jan / 1 Apr / 1 Sep).

UPDATE public.action_library
SET
  active = true,
  needs_verification = false,
  last_verified = '2026-09-17',
  source_url = 'https://www.gov.uk/free-childcare-if-working/when-to-apply'
WHERE id = 'childcare-30-hours-from-9-months';

UPDATE public.action_library
SET
  active = true,
  needs_verification = false,
  last_verified = '2026-09-17',
  source_url = 'https://www.gov.uk/help-with-childcare-costs/free-childcare-and-education-for-3-to-4-year-olds'
WHERE id = 'childcare-15-hours-from-3';

UPDATE public.action_library
SET
  active = true,
  needs_verification = false,
  last_verified = '2026-09-17',
  source_url = 'https://www.gov.uk/schools-admissions/how-to-apply',
  check_type = 'family_fact'
WHERE id IN ('primary-school-application', 'secondary-school-application');

UPDATE public.action_library
SET
  active = true,
  needs_verification = false,
  last_verified = '2026-09-17',
  source_url = 'https://www.gov.uk/schools-admissions/how-to-apply',
  check_type = 'user_confirmation'
WHERE id IN ('primary-school-offer-day', 'secondary-school-offer-day');

INSERT INTO public.term_dates (
  id, term_name, term_start_date, application_deadline, effective_from, effective_to, jurisdiction
)
SELECT *
FROM (
  VALUES
    ('england-childcare-spring-2025', 'Spring 2025', DATE '2025-01-01', DATE '2024-12-31', DATE '2024-01-01', DATE '2026-12-31', 'England'),
    ('england-childcare-summer-2025', 'Summer 2025', DATE '2025-04-01', DATE '2025-03-31', DATE '2024-01-01', DATE '2026-12-31', 'England'),
    ('england-childcare-autumn-2025', 'Autumn 2025', DATE '2025-09-01', DATE '2025-08-31', DATE '2024-01-01', DATE '2026-12-31', 'England'),
    ('england-childcare-spring-2026', 'Spring 2026', DATE '2026-01-01', DATE '2025-12-31', DATE '2025-01-01', DATE '2027-12-31', 'England'),
    ('england-childcare-summer-2026', 'Summer 2026', DATE '2026-04-01', DATE '2026-03-31', DATE '2025-01-01', DATE '2027-12-31', 'England'),
    ('england-childcare-autumn-2026', 'Autumn 2026', DATE '2026-09-01', DATE '2026-08-31', DATE '2025-01-01', DATE '2027-12-31', 'England'),
    ('england-childcare-spring-2027', 'Spring 2027', DATE '2027-01-01', DATE '2026-12-31', DATE '2026-01-01', DATE '2028-12-31', 'England'),
    ('england-childcare-summer-2027', 'Summer 2027', DATE '2027-04-01', DATE '2027-03-31', DATE '2026-01-01', DATE '2028-12-31', 'England'),
    ('england-childcare-autumn-2027', 'Autumn 2027', DATE '2027-09-01', DATE '2027-08-31', DATE '2026-01-01', DATE '2028-12-31', 'England'),
    ('england-childcare-spring-2028', 'Spring 2028', DATE '2028-01-01', DATE '2027-12-31', DATE '2027-01-01', DATE '2029-12-31', 'England'),
    ('england-childcare-summer-2028', 'Summer 2028', DATE '2028-04-01', DATE '2028-03-31', DATE '2027-01-01', DATE '2029-12-31', 'England'),
    ('england-childcare-autumn-2028', 'Autumn 2028', DATE '2028-09-01', DATE '2028-08-31', DATE '2027-01-01', DATE '2029-12-31', 'England'),
    ('england-childcare-spring-2029', 'Spring 2029', DATE '2029-01-01', DATE '2028-12-31', DATE '2028-01-01', DATE '2030-12-31', 'England'),
    ('england-childcare-summer-2029', 'Summer 2029', DATE '2029-04-01', DATE '2029-03-31', DATE '2028-01-01', DATE '2030-12-31', 'England'),
    ('england-childcare-autumn-2029', 'Autumn 2029', DATE '2029-09-01', DATE '2029-08-31', DATE '2028-01-01', DATE '2030-12-31', 'England'),
    ('england-childcare-spring-2030', 'Spring 2030', DATE '2030-01-01', DATE '2029-12-31', DATE '2029-01-01', DATE '2031-12-31', 'England'),
    ('england-childcare-summer-2030', 'Summer 2030', DATE '2030-04-01', DATE '2030-03-31', DATE '2029-01-01', DATE '2031-12-31', 'England'),
    ('england-childcare-autumn-2030', 'Autumn 2030', DATE '2030-09-01', DATE '2030-08-31', DATE '2029-01-01', DATE '2031-12-31', 'England'),
    ('england-childcare-spring-2031', 'Spring 2031', DATE '2031-01-01', DATE '2030-12-31', DATE '2030-01-01', DATE '2032-12-31', 'England'),
    ('england-childcare-summer-2031', 'Summer 2031', DATE '2031-04-01', DATE '2031-03-31', DATE '2030-01-01', DATE '2032-12-31', 'England'),
    ('england-childcare-autumn-2031', 'Autumn 2031', DATE '2031-09-01', DATE '2031-08-31', DATE '2030-01-01', DATE '2032-12-31', 'England')
) AS t(id, term_name, term_start_date, application_deadline, effective_from, effective_to, jurisdiction)
ON CONFLICT (id) DO NOTHING;
