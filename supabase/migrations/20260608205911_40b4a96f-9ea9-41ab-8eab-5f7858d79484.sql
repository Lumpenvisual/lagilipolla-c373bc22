
CREATE OR REPLACE FUNCTION public.comprobante_code(_pid uuid, _updated_at timestamptz)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT substring(encode(digest(_pid::text || extract(epoch from _updated_at)::text, 'sha256'), 'hex') from 1 for 12);
$$;
