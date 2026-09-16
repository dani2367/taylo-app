-- Auto-share existing items that are about a child, partner, or the whole family.
-- Own / unknown / unnamed jobs stay private.

UPDATE public.items AS i
SET visibility = 'shared'
WHERE i.visibility = 'private'
  AND i.who_it_affects IS NOT NULL
  AND btrim(i.who_it_affects) <> ''
  AND lower(btrim(i.who_it_affects)) NOT IN (
    'you', 'me', 'mum', 'mom', 'dad', 'parent'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = i.created_by
      AND p.first_name IS NOT NULL
      AND lower(btrim(p.first_name)) = lower(btrim(i.who_it_affects))
  )
  AND (
    lower(btrim(i.who_it_affects)) IN (
      'family',
      'whole family',
      'everyone',
      'household',
      'all',
      'shared',
      'both',
      'us'
    )
    OR EXISTS (
      SELECT 1
      FROM public.family_members AS fm
      WHERE fm.household_id = i.household_id
        AND fm.role IN ('child', 'partner')
        AND fm.first_name IS NOT NULL
        AND lower(i.who_it_affects) ~ (
          '(^|[^a-z])' || lower(fm.first_name) || '([^a-z]|$)'
        )
    )
  );

UPDATE public.items AS child
SET visibility = 'shared'
FROM public.items AS parent
WHERE child.parent_id = parent.id
  AND parent.visibility = 'shared'
  AND child.visibility = 'private';
