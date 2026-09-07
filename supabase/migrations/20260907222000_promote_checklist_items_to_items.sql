-- Promote nested checklist lines to independent obligation rows.
-- Old checklists / checklist_items tables are left in place as read-only leftovers.

insert into public.items (
  user_id,
  title,
  status,
  source,
  source_label,
  kind,
  parent_id,
  confidence,
  prep_origin,
  due_at,
  category,
  who_it_affects,
  created_at,
  updated_at
)
select
  ci.user_id,
  ci.text,
  case when ci.done then 'done' else 'open' end,
  coalesce(nullif(p.source, ''), 'manual'),
  coalesce(p.source_label, 'Prep'),
  'obligation',
  c.item_id,
  'medium',
  'inferred',
  null,
  p.category,
  p.who_it_affects,
  ci.created_at + (ci.sort_order * interval '1 millisecond'),
  now()
from public.checklist_items ci
join public.checklists c on c.id = ci.checklist_id
join public.items p on p.id = c.item_id
where c.item_id is not null
  and not exists (
    select 1
    from public.items child
    where child.parent_id = c.item_id
      and lower(child.title) = lower(ci.text)
  );
