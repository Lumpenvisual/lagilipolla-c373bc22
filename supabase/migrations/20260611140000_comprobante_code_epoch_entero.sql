-- Fix: el código del comprobante no coincidía entre el QR (cliente) y la verificación (SQL).
-- El cliente usa Math.floor(epoch_ms/1000) = segundos ENTEROS; la función SQL usaba
-- extract(epoch ...) con fracción de segundo, así que el QR nunca verificaba.
-- Se alinea la función SQL a segundos enteros para que el QR del PDF "conecte".
CREATE OR REPLACE FUNCTION public.comprobante_code(_pid uuid, _updated_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT substring(
    encode(
      digest(_pid::text || floor(extract(epoch from _updated_at))::bigint::text, 'sha256'),
      'hex'
    ) from 1 for 12
  );
$$;
