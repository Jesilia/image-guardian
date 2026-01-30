-- Watermark registry table (blockchain ledger simulation)
CREATE TABLE public.watermark_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  prompt TEXT,
  image_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups by creator_id and timestamp
CREATE INDEX idx_watermark_registry_creator_timestamp ON public.watermark_registry(creator_id, timestamp);
CREATE INDEX idx_watermark_registry_hash ON public.watermark_registry(image_hash);

-- Enable RLS
ALTER TABLE public.watermark_registry ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read the registry (public verification)
CREATE POLICY "Anyone can read watermark registry"
ON public.watermark_registry
FOR SELECT
USING (true);

-- Allow anyone to insert (no auth required for watermarking)
CREATE POLICY "Anyone can register watermarks"
ON public.watermark_registry
FOR INSERT
WITH CHECK (true);