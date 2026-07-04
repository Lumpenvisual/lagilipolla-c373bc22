-- Privacidad de la tabla pública: los MARCADORES de cada usuario no se ven en el
-- leaderboard (RPC anon get_public_pick) hasta que INICIA el primer partido de esa fase.
--
-- Regla de revelación (kickoff, no el candado de edición que cierra 1h antes):
--   una fase se revela cuando now() >= MIN(fecha de sus partidos). Si la fase no tiene
--   fechas válidas → NO se revela (queda oculta).
--
-- Redacta antes de devolver:
--   - extra_matches: solo las claves cuyo `fase` ya inició.
--   - group_k_matches: solo si el Grupo K ya inició; si no, '{}'.
-- No cambia: groups (posiciones), goleador_id, arquero_id, puntos_total, updated_at.
-- Mantiene firma, SECURITY DEFINER, search_path y el GRANT a authenticated/anon.

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
  WITH ts AS (
    SELECT group_k_matches, extra_matches
    FROM public.tournament_state WHERE id = 1
  ),
  -- Ids de partidos KO cuya FASE ya inició (primer partido de la fase <= now()).
  ko_revealed_ids AS (
    SELECT m->>'id' AS id
    FROM ts, jsonb_array_elements(COALESCE(ts.extra_matches, '[]'::jsonb)) m
    WHERE m->>'fase' IN (
      SELECT m2->>'fase'
      FROM ts t2, jsonb_array_elements(COALESCE(t2.extra_matches, '[]'::jsonb)) m2
      GROUP BY m2->>'fase'
      HAVING now() >= MIN(NULLIF(m2->>'fecha', '')::timestamptz)
    )
  ),
  -- ¿Ya inició el Grupo K? (primer partido de group_k_matches <= now())
  gk_started AS (
    SELECT COALESCE(now() >= MIN(NULLIF(m->>'fecha', '')::timestamptz), false) AS started
    FROM ts, jsonb_array_elements(COALESCE(ts.group_k_matches, '[]'::jsonb)) m
  )
  SELECT
    pa.id,
    pa.nombre,
    COALESCE(pk.groups, '{}'::jsonb),
    CASE
      WHEN (SELECT started FROM gk_started)
      THEN COALESCE(pk.group_k_matches, '{}'::jsonb)
      ELSE '{}'::jsonb
    END,
    COALESCE(
      (
        SELECT jsonb_object_agg(e.key, e.value)
        FROM jsonb_each(COALESCE(pk.extra_matches, '{}'::jsonb)) e
        WHERE e.key IN (SELECT id FROM ko_revealed_ids)
      ),
      '{}'::jsonb
    ),
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
