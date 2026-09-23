-- Source email reads follow the linked item.
-- The mailbox owner always sees their own rows. Anyone else sees a row only when
-- they can already read the item it is attached to (shared + same household, or they
-- created it). Writes stay with the mailbox owner.
-- The EXISTS leans on items RLS, which does not reference source_emails.

DROP POLICY IF EXISTS "own source_emails" ON public.source_emails;

CREATE POLICY "select visible source_emails"
  ON public.source_emails
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.items AS i
      WHERE i.id = source_emails.item_id
    )
  );

CREATE POLICY "insert own source_emails"
  ON public.source_emails
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "update own source_emails"
  ON public.source_emails
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "delete own source_emails"
  ON public.source_emails
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
