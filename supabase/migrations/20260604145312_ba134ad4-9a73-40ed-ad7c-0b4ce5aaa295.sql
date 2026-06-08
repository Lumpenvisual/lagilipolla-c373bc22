
DROP VIEW IF EXISTS public.leaderboard;

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  participant_id uuid,
  nombre text,
  total_puntos bigint,
  exactos bigint,
  ganadores bigint,
  posicion bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id AS participant_id,
    p.nombre,
    COALESCE(SUM(pr.puntos_obtenidos),0) AS total_puntos,
    COUNT(CASE WHEN pr.puntos_obtenidos = 3 THEN 1 END) AS exactos,
    COUNT(CASE WHEN pr.puntos_obtenidos = 1 THEN 1 END) AS ganadores,
    RANK() OVER (
      ORDER BY COALESCE(SUM(pr.puntos_obtenidos),0) DESC,
               COUNT(CASE WHEN pr.puntos_obtenidos = 3 THEN 1 END) DESC
    ) AS posicion
  FROM public.participants p
  LEFT JOIN public.predictions pr ON pr.participant_id = p.id
  WHERE p.estado_pago = 'aprobado'
  GROUP BY p.id, p.nombre;
$$;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO anon, authenticated;
