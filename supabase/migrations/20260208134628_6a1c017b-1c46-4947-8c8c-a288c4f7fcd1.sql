-- Drop existing insert policy and recreate to allow email as creator_id
DROP POLICY IF EXISTS "Authenticated users can register own watermarks" ON public.watermark_registry;

-- New policy: authenticated users can insert where creator_id matches their email
CREATE POLICY "Authenticated users can register own watermarks"
ON public.watermark_registry
FOR INSERT
TO authenticated
WITH CHECK (
  creator_id = (auth.jwt() ->> 'email')
  OR creator_id = (auth.uid())::text
);