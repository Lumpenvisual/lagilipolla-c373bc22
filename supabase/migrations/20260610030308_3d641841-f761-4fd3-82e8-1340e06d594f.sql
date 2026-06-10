
CREATE OR REPLACE FUNCTION public.get_public_pick(_participant_id uuid)
RETURNS TABLE(
  participant_id uuid,
  nombre text,
  groups jsonb,
  group_k_matches jsonb,
  extra_matches jsonb,
  goleador_id text,
  arquero_id text,
  puntos_total integer,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pa.id,
    pa.nombre,
    COALESCE(pk.groups, '{}'::jsonb),
    COALESCE(pk.group_k_matches, '{}'::jsonb),
    COALESCE(pk.extra_matches, '{}'::jsonb),
    pk.goleador_id,
    pk.arquero_id,
    COALESCE(pk.puntos_total, 0),
    pk.updated_at
  FROM public.participants pa
  LEFT JOIN public.picks pk ON pk.participant_id = pa.id
  WHERE pa.id = _participant_id
    AND pa.estado_pago = 'aprobado'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_pick(uuid) TO authenticated, anon;
