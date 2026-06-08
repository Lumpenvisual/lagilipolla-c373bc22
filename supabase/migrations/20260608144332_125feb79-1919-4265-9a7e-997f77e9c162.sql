-- 1. Lock down get_participant_predictions: require auth; non-owner/non-admin
-- callers only ever see predictions for matches that have already kicked off.
CREATE OR REPLACE FUNCTION public.get_participant_predictions(_participant_id uuid)
RETURNS TABLE (
  match_id integer,
  numero_partido integer,
  jornada smallint,
  equipo_local varchar,
  equipo_visitante varchar,
  grupo char,
  kickoff_time timestamptz,
  goles_local smallint,
  goles_visitante smallint,
  goles_local_pred smallint,
  goles_visitante_pred smallint,
  puntos_obtenidos smallint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.numero_partido, m.jornada, m.equipo_local, m.equipo_visitante,
         m.grupo, m.kickoff_time, m.goles_local, m.goles_visitante,
         pr.goles_local_pred, pr.goles_visitante_pred, pr.puntos_obtenidos
  FROM public.matches m
  LEFT JOIN public.predictions pr
    ON pr.match_id = m.id AND pr.participant_id = _participant_id
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = _participant_id AND p.estado_pago = 'aprobado'
    )
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (SELECT user_id FROM public.participants WHERE id = _participant_id) = auth.uid()
      OR m.kickoff_time <= now()
    )
  ORDER BY m.numero_partido;
$$;

REVOKE EXECUTE ON FUNCTION public.get_participant_predictions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_participant_predictions(uuid) TO authenticated;

-- 2. Prevent participants from writing their own puntos_obtenidos (score integrity).
DROP POLICY IF EXISTS predictions_own_insert ON public.predictions;
CREATE POLICY predictions_own_insert ON public.predictions
FOR INSERT TO authenticated
WITH CHECK (
  participant_id = (SELECT id FROM public.participants WHERE user_id = auth.uid())
  AND (SELECT kickoff_time FROM public.matches WHERE id = predictions.match_id) > now()
  AND (SELECT estado_pago FROM public.participants WHERE user_id = auth.uid()) = 'aprobado'
  AND puntos_obtenidos = 0
);

DROP POLICY IF EXISTS predictions_own_update ON public.predictions;
CREATE POLICY predictions_own_update ON public.predictions
FOR UPDATE TO authenticated
USING (
  participant_id = (SELECT id FROM public.participants WHERE user_id = auth.uid())
  AND (SELECT kickoff_time FROM public.matches WHERE id = predictions.match_id) > now()
)
WITH CHECK (
  participant_id = (SELECT id FROM public.participants WHERE user_id = auth.uid())
  AND (SELECT kickoff_time FROM public.matches WHERE id = predictions.match_id) > now()
  AND puntos_obtenidos = 0
);

-- 3. Complete the comprobantes bucket access model with an owner/admin DELETE policy.
DROP POLICY IF EXISTS comprobantes_delete_own_or_admin ON storage.objects;
CREATE POLICY comprobantes_delete_own_or_admin ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'comprobantes'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- 4. demo_seed: explicit admin-only read policy (resolves "RLS enabled, no policy").
GRANT SELECT ON public.demo_seed TO authenticated;
DROP POLICY IF EXISTS demo_seed_admin_read ON public.demo_seed;
CREATE POLICY demo_seed_admin_read ON public.demo_seed
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Stop broadcasting per-user predictions over Realtime. The leaderboard only
-- changes when official match results are entered (matches stays published), so
-- predictions no longer need a Realtime channel that could leak rival picks.
ALTER PUBLICATION supabase_realtime DROP TABLE public.predictions;