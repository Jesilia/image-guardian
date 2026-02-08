
-- Drop existing permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can register watermarks" ON public.watermark_registry;

-- Require authentication for INSERT and validate creator_id matches auth user
CREATE POLICY "Authenticated users can register own watermarks"
ON public.watermark_registry
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = creator_id);

-- Keep SELECT public for verification (core feature) but this is intentional
-- Verification requires public hash lookup to work
