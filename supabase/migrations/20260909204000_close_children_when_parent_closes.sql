-- If a parent is dismissed, done, or delegated, its open children close with it.
CREATE OR REPLACE FUNCTION private.close_children_when_parent_closes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('done', 'dismissed', 'delegated')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.items
    SET status = NEW.status
    WHERE parent_id = NEW.id
      AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_close_children_when_parent_closes ON public.items;
CREATE TRIGGER items_close_children_when_parent_closes
AFTER UPDATE OF status ON public.items
FOR EACH ROW
EXECUTE FUNCTION private.close_children_when_parent_closes();

UPDATE public.items AS child
SET status = parent.status
FROM public.items AS parent
WHERE child.parent_id = parent.id
  AND child.status = 'open'
  AND parent.status IN ('done', 'dismissed', 'delegated');
