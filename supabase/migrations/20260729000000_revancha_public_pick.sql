-- Añade get_public_revancha_pick(uuid), el equivalente de get_public_pick(uuid) pero para
-- La Revancha: lee revancha_picks en vez de picks, y solo tiene extra_matches (semis+final) —
-- sin groups/group_k_matches/goleador_id/arquero_id, porque esa competencia no los tiene.
--
-- Hace falta porque el detalle expandible de la tabla de La Revancha necesita ver la
-- planilla de OTROS participantes (no solo la propia) — RLS en revancha_picks
-- (revancha_picks_own_read) solo deja ver la fila propia o al admin, así que sin este RPC
-- SECURITY DEFINER no hay forma pública de leer el detalle de alguien más, igual que pasaba
-- con picks antes de que existiera get_public_pick.
--
-- Mismo criterio de privacidad que get_public_pick (20260704120000_public_pick_hide_marcadores.sql):
-- los marcadores de una fase se ocultan hasta que INICIA su primer partido (kickoff, no el
-- candado de edición). Acá solo hace falta mirar semis/final —Revancha no depende de las
-- demás fases— así que el filtro de "fases reveladas" se acota a esas dos desde el vamos.
--
-- Gate de "quién aparece": pa.estado_pago_revancha = 'aprobado' (la contraparte exacta de
-- estado_pago = 'aprobado' en get_public_pick). Sin exclusión explícita de admin: el mismo
-- criterio que get_public_pick, que tampoco la tiene — el cliente solo llama a esta función
-- con ids que salieron de get_revancha_leaderboard(), que ya excluye al admin.
CREATE OR REPLACE FUNCTION public.get_public_revancha_pick(_participant_id uuid)
RETURNS TABLE(
  participant_id uuid,
  nombre text,
  extra_matches jsonb,
  puntos integer,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ts AS (
    SELECT extra_matches FROM public.tournament_state WHERE id = 1
  ),
  -- Ids de partidos de semis/final cuya FASE ya inició (primer partido de la fase <= now()).
  revancha_revealed_ids AS (
    SELECT m->>'id' AS id
    FROM ts, jsonb_array_elements(COALESCE(ts.extra_matches, '[]'::jsonb)) m
    WHERE m->>'fase' IN (
      SELECT m2->>'fase'
      FROM ts t2, jsonb_array_elements(COALESCE(t2.extra_matches, '[]'::jsonb)) m2
      WHERE m2->>'fase' IN ('semis', 'final')
      GROUP BY m2->>'fase'
      HAVING now() >= MIN(NULLIF(m2->>'fecha', '')::timestamptz)
    )
  )
  SELECT
    pa.id,
    pa.nombre,
    COALESCE(
      (
        SELECT jsonb_object_agg(e.key, e.value)
        FROM jsonb_each(COALESCE(rp.extra_matches, '{}'::jsonb)) e
        WHERE e.key IN (SELECT id FROM revancha_revealed_ids)
      ),
      '{}'::jsonb
    ),
    COALESCE(rp.puntos, 0),
    rp.updated_at
  FROM public.participants pa
  LEFT JOIN public.revancha_picks rp ON rp.participant_id = pa.id
  WHERE pa.id = _participant_id
    AND pa.estado_pago_revancha = 'aprobado'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_revancha_pick(uuid) TO authenticated, anon;
