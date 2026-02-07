-- Drop the old authenticated-only insert policy
DROP POLICY IF EXISTS "Authenticated users can register their own watermarks" ON public.watermark_registry;

-- Allow anyone to insert watermark records (public access model)
CREATE POLICY "Anyone can register watermarks"
ON public.watermark_registry
FOR INSERT
WITH CHECK (true);