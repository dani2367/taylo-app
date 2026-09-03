CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  user_email text,
  title text NOT NULL,
  body text,
  detail text,
  suggestion text,
  category text,
  icon text,
  colour_class text,
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'email',
  source_label text,
  event_date date,
  urgency_level text,
  who_it_affects text,
  action_description text,
  delegated_to text,
  source_email_subject text,
  source_email_sender text,
  slug text,
  opener text,
  suggestion_chips jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_status_check CHECK (status IN ('open', 'done', 'delegated', 'dismissed')),
  CONSTRAINT items_source_check CHECK (source IN ('email', 'chat', 'manual', 'calendar')),
  CONSTRAINT items_urgency_level_check CHECK (
    urgency_level IS NULL OR urgency_level IN ('today', 'this_week', 'upcoming', 'none')
  )
);

CREATE INDEX items_user_id_idx ON public.items (user_id);
CREATE INDEX items_user_id_status_idx ON public.items (user_id, status);
CREATE INDEX items_user_id_source_email_subject_idx ON public.items (user_id, source_email_subject);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own items"
  ON public.items
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;

CREATE TRIGGER items_updated_at
BEFORE UPDATE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_item_user_email
BEFORE INSERT OR UPDATE OF user_id ON public.items
FOR EACH ROW
EXECUTE FUNCTION private.set_nudge_user_email();

INSERT INTO public.items (
  id,
  user_id,
  user_email,
  title,
  body,
  detail,
  suggestion,
  category,
  icon,
  colour_class,
  status,
  source,
  source_label,
  event_date,
  urgency_level,
  who_it_affects,
  action_description,
  delegated_to,
  source_email_subject,
  source_email_sender,
  slug,
  opener,
  suggestion_chips,
  created_at,
  updated_at
)
SELECT
  n.id,
  n.user_id,
  n.user_email,
  n.title,
  n.body,
  n.detail,
  n.suggestion,
  n.category,
  n.icon,
  n.colour_class,
  n.status::text,
  n.source,
  n.source_label,
  n.due_date,
  COALESCE(n.urgency_level, CASE WHEN n.urgent THEN 'today' ELSE NULL END),
  n.who_it_affects,
  n.action_description,
  n.delegated_to::text,
  n.source_email_subject,
  n.source_email_sender,
  n.slug,
  n.opener,
  n.suggestion_chips,
  n.created_at,
  n.updated_at
FROM public.nudges AS n;

INSERT INTO public.items (
  id,
  user_id,
  title,
  body,
  detail,
  opener,
  suggestion_chips,
  icon,
  status,
  source,
  source_label,
  event_date,
  slug,
  created_at,
  updated_at
)
SELECT
  a.id,
  a.user_id,
  a.title,
  a.subtitle,
  a.opener,
  a.opener,
  a.suggestion_chips,
  a.icon,
  CASE WHEN a.status::text IN ('open', 'done', 'delegated', 'dismissed') THEN a.status::text ELSE 'open' END,
  'calendar',
  a.source_label,
  a.event_date,
  a.slug,
  a.created_at,
  a.updated_at
FROM public.ahead_items AS a;

ALTER TABLE public.source_emails
  DROP CONSTRAINT source_emails_nudge_id_fkey;

ALTER TABLE public.source_emails
  RENAME COLUMN nudge_id TO item_id;

ALTER INDEX public.source_emails_nudge_id_idx RENAME TO source_emails_item_id_idx;

ALTER TABLE public.source_emails
  ADD CONSTRAINT source_emails_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items (id) ON DELETE SET NULL;
