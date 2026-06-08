CREATE OR REPLACE FUNCTION public.get_concursos_overview()
 RETURNS TABLE(id uuid, nombre text, modalidad text, alcance jsonb, cuota numeric, estado text, deadline timestamp with time zone, jugadores bigint, partidos bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH totals AS (
    SELECT count(*)::bigint AS total FROM public.matches
  ),
  by_fase AS (
    SELECT fase, count(*)::bigint AS n FROM public.matches GROUP BY fase
  ),
  by_fecha AS (
    SELECT ((kickoff_time AT TIME ZONE 'UTC') - INTERVAL '4 hours')::date AS d,
           count(*)::bigint AS n
    FROM public.matches GROUP BY 1
  ),
  enr AS (
    SELECT concurso_id, count(*)::bigint AS n
    FROM public.inscripciones
    WHERE estado_pago = 'aprobado'
    GROUP BY concurso_id
  )
  SELECT c.id, c.nombre, c.modalidad, c.alcance, c.cuota, c.estado, c.deadline,
    COALESCE(e.n, 0) AS jugadores,
    CASE
      WHEN c.alcance ? 'todos' THEN (SELECT total FROM totals)
      WHEN c.alcance ? 'match_id' THEN 1::bigint
      WHEN c.alcance ? 'fase' THEN COALESCE((SELECT n FROM by_fase f WHERE f.fase = c.alcance->>'fase'), 0)
      WHEN c.alcance ? 'fecha' THEN COALESCE((SELECT n FROM by_fecha bf WHERE bf.d = (c.alcance->>'fecha')::date), 0)
      ELSE 0::bigint
    END AS partidos
  FROM public.concursos c
  LEFT JOIN enr e ON e.concurso_id = c.id
  WHERE c.estado <> 'proximo' OR has_role(auth.uid(),'admin')
  ORDER BY
    CASE c.estado WHEN 'abierto' THEN 0 WHEN 'cerrado' THEN 1 WHEN 'finalizado' THEN 2 ELSE 3 END,
    c.deadline NULLS LAST;
$function$;