
-- Add hash chain columns for immutability
ALTER TABLE public.watermark_registry
  ADD COLUMN prev_hash text DEFAULT NULL,
  ADD COLUMN chain_hash text DEFAULT NULL;

-- Create a function to compute and set the chain hash on insert
CREATE OR REPLACE FUNCTION public.set_chain_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_hash text;
  _payload text;
BEGIN
  -- Get the chain_hash of the most recent entry (excluding current)
  SELECT chain_hash INTO _prev_hash
  FROM public.watermark_registry
  WHERE id != NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no previous entry, use genesis hash
  IF _prev_hash IS NULL THEN
    _prev_hash := 'GENESIS';
  END IF;

  NEW.prev_hash := _prev_hash;

  -- Build deterministic payload: creator_id|timestamp|image_hash|prompt|prev_hash
  _payload := NEW.creator_id || '|' || NEW.timestamp || '|' || NEW.image_hash || '|' || COALESCE(NEW.prompt, '') || '|' || _prev_hash;

  -- Compute SHA-256 chain hash
  NEW.chain_hash := encode(sha256(_payload::bytea), 'hex');

  RETURN NEW;
END;
$$;

-- Trigger to auto-compute chain hash on every insert
CREATE TRIGGER trg_set_chain_hash
BEFORE INSERT ON public.watermark_registry
FOR EACH ROW
EXECUTE FUNCTION public.set_chain_hash();

-- Create a function to verify the entire chain integrity
CREATE OR REPLACE FUNCTION public.verify_chain_integrity()
RETURNS TABLE(id uuid, is_valid boolean, expected_hash text, actual_hash text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  _prev_hash text := 'GENESIS';
  _payload text;
  _expected text;
BEGIN
  FOR rec IN
    SELECT r.id, r.creator_id, r.timestamp, r.image_hash, r.prompt, r.prev_hash, r.chain_hash
    FROM public.watermark_registry r
    ORDER BY r.created_at ASC
  LOOP
    _payload := rec.creator_id || '|' || rec.timestamp || '|' || rec.image_hash || '|' || COALESCE(rec.prompt, '') || '|' || _prev_hash;
    _expected := encode(sha256(_payload::bytea), 'hex');

    id := rec.id;
    expected_hash := _expected;
    actual_hash := rec.chain_hash;
    is_valid := (_expected = rec.chain_hash) AND (_prev_hash = rec.prev_hash);

    RETURN NEXT;

    _prev_hash := rec.chain_hash;
  END LOOP;
END;
$$;
