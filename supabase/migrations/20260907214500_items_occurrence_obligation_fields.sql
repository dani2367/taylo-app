-- Additive occurrence / obligation / hold fields on items.
-- Existing Home / Radar / Schedule / Family queries are unchanged; new columns are unused by the app.

alter table public.items
  add column kind text,
  add column occurs_at timestamptz,
  add column due_at timestamptz,
  add column confidence text,
  add column prep_origin text,
  add column evidence text,
  add column surface_from timestamptz,
  add column surface_until timestamptz,
  add column parent_id uuid;

alter table public.items
  add constraint items_kind_check
  check (kind is null or kind in ('occurrence', 'obligation', 'hold', 'list_item', 'context_only'));

alter table public.items
  add constraint items_confidence_check
  check (confidence is null or confidence in ('high', 'medium', 'low'));

alter table public.items
  add constraint items_prep_origin_check
  check (prep_origin is null or prep_origin in ('stated', 'inferred', 'none'));

alter table public.items
  add constraint items_parent_id_fkey
  foreign key (parent_id) references public.items (id) on delete set null;

alter table public.items
  add constraint items_parent_id_not_self_check
  check (parent_id is distinct from id);

create index items_parent_id_idx on public.items (parent_id);

comment on column public.items.kind is 'Canonical type: occurrence, obligation, hold, list_item, or context_only.';
comment on column public.items.occurs_at is 'When something genuinely happens. Calendar sources only.';
comment on column public.items.due_at is 'When an action is due. Distinct from occurs_at.';
comment on column public.items.confidence is 'Inference confidence: high, medium, or low.';
comment on column public.items.prep_origin is 'Whether prep was stated, inferred, or none.';
comment on column public.items.evidence is 'Short quote/reference supporting the item; empty if purely inferred.';
comment on column public.items.surface_from is 'Start of Home/Radar eligibility window.';
comment on column public.items.surface_until is 'End of Home/Radar eligibility window.';
comment on column public.items.parent_id is 'Obligation → occurrence that created it.';

-- Backfill. Precedence: list collection → calendar occurrence → dated non-calendar obligation → undated hold.
update public.items i
set
  kind = case
    when c.type in ('shopping', 'todo', 'custom') then 'list_item'
    when i.source = 'calendar' then 'occurrence'
    when i.event_date is not null then 'obligation'
    else 'hold'
  end,
  occurs_at = case
    when i.source = 'calendar' and i.event_date is not null
      then i.event_date at time zone 'Europe/London'
    else null
  end,
  due_at = case
    when i.source = 'calendar' then null
    when i.event_date is not null then i.event_date at time zone 'Europe/London'
    else null
  end,
  confidence = case
    when i.source = 'calendar' then 'high'
    when i.event_date is not null then 'medium'
    else 'medium'
  end,
  prep_origin = 'none'
from public.collections c
where c.id = i.collection_id;

update public.items i
set
  kind = case
    when i.source = 'calendar' then 'occurrence'
    when i.event_date is not null then 'obligation'
    else 'hold'
  end,
  occurs_at = case
    when i.source = 'calendar' and i.event_date is not null
      then i.event_date at time zone 'Europe/London'
    else null
  end,
  due_at = case
    when i.source = 'calendar' then null
    when i.event_date is not null then i.event_date at time zone 'Europe/London'
    else null
  end,
  confidence = case
    when i.source = 'calendar' then 'high'
    when i.event_date is not null then 'medium'
    else 'medium'
  end,
  prep_origin = 'none'
where i.collection_id is null;
