CREATE OR REPLACE FUNCTION public.get_concursos_overview()
RETURNS TABLE(
  id uuid, nombre text, modalidad text, alcance jsonb, cuota numeric,
  estado text, deadline timestamptz, jugadores bigint, partidos bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.nombre, c.modalidad, c.alcance, c.cuota, c.estado, c.deadline,
    (SELECT count(*) FROM public.inscripciones i WHERE i.concurso_id = c.id AND i.estado_pago = 'aprobado') AS jugadores,
    (SELECT count(*) FROM public.get_concurso_matches(c.id)) AS partidos
  FROM public.concursos c
  WHERE c.estado <> 'proximo' OR has_role(auth.uid(),'admin')
  ORDER BY
    CASE c.estado WHEN 'abierto' THEN 0 WHEN 'cerrado' THEN 1 WHEN 'finalizado' THEN 2 ELSE 3 END,
    c.deadline NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.get_concursos_overview() TO anon, authenticated;