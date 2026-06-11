-- El admin (Admin Guanábano) fija los resultados oficiales; NO compite en el ranking.
-- get_polla_leaderboard excluye a cualquier participante cuyo user_id tenga rol 'admin'.
CREATE OR REPLACE FUNCTION public.get_polla_leaderboard()
 RETURNS TABLE(participant_id uuid, nombre text, puntos_grupos int, puntos_partidos int, puntos_especiales int, puntos_total int, aciertos_5 int, aciertos_3 int, aciertos_2 int, posicion bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    pa.id, pa.nombre,
    COALESCE(pk.puntos_grupos, 0),
    COALESCE(pk.puntos_partidos, 0),
    COALESCE(pk.puntos_especiales, 0),
    COALESCE(pk.puntos_total, 0),
    COALESCE(pk.aciertos_5, 0),
    COALESCE(pk.aciertos_3, 0),
    COALESCE(pk.aciertos_2, 0),
    RANK() OVER (ORDER BY
      COALESCE(pk.puntos_total,0) DESC,
      COALESCE(pk.aciertos_5,0) DESC,
      COALESCE(pk.aciertos_3,0) DESC,
      COALESCE(pk.aciertos_2,0) DESC)
  FROM public.participants pa
  LEFT JOIN public.picks pk ON pk.participant_id = pa.id
  WHERE pa.estado_pago = 'aprobado'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = pa.user_id AND ur.role = 'admin'
    );
$function$;
