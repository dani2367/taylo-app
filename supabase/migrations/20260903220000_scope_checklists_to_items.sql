ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.items (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS checklists_item_id_uidx
  ON public.checklists (item_id)
  WHERE item_id IS NOT NULL;

COMMENT ON COLUMN public.checklists.item_id IS
  'Owning item for a per-item prep checklist. Null for standalone lists.';
