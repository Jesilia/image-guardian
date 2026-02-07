-- Update RLS policies to require authentication for inserts while keeping reads public

-- Drop existing overly permissive insert policy
DROP POLICY IF EXISTS "Anyone can register watermarks" ON public.watermark_registry;

-- Create new policy that requires authentication and validates user
CREATE POLICY "Authenticated users can register their own watermarks" 
ON public.watermark_registry 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid()::text = creator_id);

-- Keep read policy public for verification purposes (anyone can verify an image)
-- The existing "Anyone can read watermark registry" policy is appropriate for this use case