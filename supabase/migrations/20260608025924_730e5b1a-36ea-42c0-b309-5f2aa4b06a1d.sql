-- 0. Relax jornada check to allow knockout matches (jornada 0)
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_jornada_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_jornada_check CHECK (jornada BETWEEN 0 AND 20);

-- 1. Fase column on matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS fase text NOT NULL DEFAULT 'grupos';
UPDATE public.matches SET fase = 'grupos' WHERE fase IS NULL OR fase = '';
CREATE INDEX IF NOT EXISTS idx_matches_fase ON public.matches(fase);

-- 2. Knockout matches (32) with "Por definir" teams
INSERT INTO public.matches (numero_partido, jornada, equipo_local, equipo_visitante, grupo, estadio, kickoff_time, fase)
SELECT 72 + g, 0, 'Por definir', 'Por definir', '-', 'Por definir',
  TIMESTAMPTZ '2026-06-28 16:00:00+00' + (((g-1)/2) * INTERVAL '1 day') + (((g-1)%2) * INTERVAL '4 hours'),
  'dieciseisavos'
FROM generate_series(1,16) g
WHERE NOT EXISTS (SELECT 1 FROM public.matches WHERE numero_partido = 72 + g);

INSERT INTO public.matches (numero_partido, jornada, equipo_local, equipo_visitante, grupo, estadio, kickoff_time, fase)
SELECT 88 + g, 0, 'Por definir', 'Por definir', '-', 'Por definir',
  TIMESTAMPTZ '2026-07-04 16:00:00+00' + (((g-1)/2) * INTERVAL '1 day') + (((g-1)%2) * INTERVAL '4 hours'),
  'octavos'
FROM generate_series(1,8) g
WHERE NOT EXISTS (SELECT 1 FROM public.matches WHERE numero_partido = 88 + g);

INSERT INTO public.matches (numero_partido, jornada, equipo_local, equipo_visitante, grupo, estadio, kickoff_time, fase)
SELECT 96 + g, 0, 'Por definir', 'Por definir', '-', 'Por definir',
  TIMESTAMPTZ '2026-07-09 16:00:00+00' + (((g-1)/2) * INTERVAL '1 day') + (((g-1)%2) * INTERVAL '4 hours'),
  'cuartos'
FROM generate_series(1,4) g
WHERE NOT EXISTS (SELECT 1 FROM public.matches WHERE numero_partido = 96 + g);

INSERT INTO public.matches (numero_partido, jornada, equipo_local, equipo_visitante, grupo, estadio, kickoff_time, fase)
SELECT 100 + g, 0, 'Por definir', 'Por definir', '-', 'Por definir',
  TIMESTAMPTZ '2026-07-14 20:00:00+00' + ((g-1) * INTERVAL '1 day'),
  'semis'
FROM generate_series(1,2) g
WHERE NOT EXISTS (SELECT 1 FROM public.matches WHERE numero_partido = 100 + g);

INSERT INTO public.matches (numero_partido, jornada, equipo_local, equipo_visitante, grupo, estadio, kickoff_time, fase)
SELECT 103, 0, 'Por definir', 'Por definir', '-', 'Por definir', TIMESTAMPTZ '2026-07-18 16:00:00+00', 'tercer_puesto'
WHERE NOT EXISTS (SELECT 1 FROM public.matches WHERE numero_partido = 103);

INSERT INTO public.matches (numero_partido, jornada, equipo_local, equipo_visitante, grupo, estadio, kickoff_time, fase)
SELECT 104, 0, 'Por definir', 'Por definir', '-', 'Por definir', TIMESTAMPTZ '2026-07-19 16:00:00+00', 'final'
WHERE NOT EXISTS (SELECT 1 FROM public.matches WHERE numero_partido = 104);

-- 3. updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 4. concursos table
CREATE TABLE public.concursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  modalidad text NOT NULL CHECK (modalidad IN ('partido','dia','fase','mundial')),
  alcance jsonb NOT NULL DEFAULT '{}'::jsonb,
  cuota numeric NOT NULL DEFAULT 20 CHECK (cuota >= 0),
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('proximo','abierto','cerrado','finalizado')),
  deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.concursos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.concursos TO authenticated;
GRANT ALL ON public.concursos TO service_role;
ALTER TABLE public.concursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY concursos_public_read ON public.concursos FOR SELECT TO anon, authenticated
  USING (estado <> 'proximo' OR has_role(auth.uid(),'admin'));
CREATE POLICY concursos_admin_write ON public.concursos FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_concursos_updated BEFORE UPDATE ON public.concursos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. inscripciones table
CREATE TABLE public.inscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concurso_id uuid NOT NULL REFERENCES public.concursos(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  estado_pago text NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente','aprobado','rechazado')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concurso_id, participant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inscripciones TO authenticated;
GRANT ALL ON public.inscripciones TO service_role;
ALTER TABLE public.inscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY inscripciones_read ON public.inscripciones FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR participant_id = (SELECT id FROM public.participants WHERE user_id = auth.uid()));
CREATE POLICY inscripciones_own_insert ON public.inscripciones FOR INSERT TO authenticated
  WITH CHECK (estado_pago = 'pendiente' AND participant_id = (SELECT id FROM public.participants WHERE user_id = auth.uid()));
CREATE POLICY inscripciones_own_delete ON public.inscripciones FOR DELETE TO authenticated
  USING (estado_pago = 'pendiente' AND participant_id = (SELECT id FROM public.participants WHERE user_id = auth.uid()));
CREATE POLICY inscripciones_admin_all ON public.inscripciones FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 6. get_concurso_matches
CREATE OR REPLACE FUNCTION public.get_concurso_matches(_concurso_id uuid)
RETURNS SETOF public.matches
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.concursos WHERE id = _concurso_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF c.alcance ? 'todos' THEN
    RETURN QUERY SELECT * FROM public.matches ORDER BY numero_partido;
  ELSIF c.alcance ? 'match_id' THEN
    RETURN QUERY SELECT * FROM public.matches WHERE id = (c.alcance->>'match_id')::int;
  ELSIF c.alcance ? 'fase' THEN
    RETURN QUERY SELECT * FROM public.matches WHERE fase = (c.alcance->>'fase') ORDER BY numero_partido;
  ELSIF c.alcance ? 'fecha' THEN
    RETURN QUERY SELECT * FROM public.matches
      WHERE ((kickoff_time AT TIME ZONE 'UTC') - INTERVAL '4 hours')::date = (c.alcance->>'fecha')::date
      ORDER BY numero_partido;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_concurso_matches(uuid) TO anon, authenticated;

-- 7. get_concurso_leaderboard
CREATE OR REPLACE FUNCTION public.get_concurso_leaderboard(_concurso_id uuid)
RETURNS TABLE(participant_id uuid, nombre text, total_puntos bigint, exactos bigint, ganadores bigint, posicion bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cm AS (SELECT id FROM public.get_concurso_matches(_concurso_id)),
  enrolled AS (
    SELECT i.participant_id FROM public.inscripciones i
    WHERE i.concurso_id = _concurso_id AND i.estado_pago = 'aprobado'
  )
  SELECT p.id, p.nombre,
    COALESCE(SUM(pr.puntos_obtenidos),0) AS total_puntos,
    COUNT(CASE WHEN pr.puntos_obtenidos = 3 THEN 1 END) AS exactos,
    COUNT(CASE WHEN pr.puntos_obtenidos = 1 THEN 1 END) AS ganadores,
    RANK() OVER (ORDER BY COALESCE(SUM(pr.puntos_obtenidos),0) DESC,
                          COUNT(CASE WHEN pr.puntos_obtenidos = 3 THEN 1 END) DESC) AS posicion
  FROM public.participants p
  JOIN enrolled e ON e.participant_id = p.id
  LEFT JOIN public.predictions pr ON pr.participant_id = p.id AND pr.match_id IN (SELECT id FROM cm)
  GROUP BY p.id, p.nombre;
$$;
GRANT EXECUTE ON FUNCTION public.get_concurso_leaderboard(uuid) TO anon, authenticated;

-- 8. generate_concursos (admin only)
CREATE OR REPLACE FUNCTION public.generate_concursos(_include_partidos boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; created int := 0;
  v_alcance jsonb; v_estado text; v_nombre text; fase_label text;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_alcance := jsonb_build_object('todos', true);
  IF NOT EXISTS (SELECT 1 FROM public.concursos WHERE alcance = v_alcance) THEN
    INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
    SELECT 'Mundial completo', 'mundial', v_alcance, 20,
      CASE WHEN MIN(kickoff_time) > now() THEN 'abierto' ELSE 'cerrado' END, MIN(kickoff_time)
    FROM public.matches;
    created := created + 1;
  END IF;

  FOR r IN SELECT fase, MIN(kickoff_time) AS dl, bool_and(equipo_local = 'Por definir') AS undefined
           FROM public.matches GROUP BY fase LOOP
    v_alcance := jsonb_build_object('fase', r.fase);
    IF NOT EXISTS (SELECT 1 FROM public.concursos WHERE alcance = v_alcance) THEN
      fase_label := CASE r.fase
        WHEN 'grupos' THEN 'Fase de grupos'
        WHEN 'dieciseisavos' THEN 'Dieciseisavos'
        WHEN 'octavos' THEN 'Octavos de final'
        WHEN 'cuartos' THEN 'Cuartos de final'
        WHEN 'semis' THEN 'Semifinales'
        WHEN 'tercer_puesto' THEN 'Tercer puesto'
        WHEN 'final' THEN 'Final'
        ELSE initcap(r.fase) END;
      v_estado := CASE WHEN r.undefined THEN 'proximo' WHEN r.dl > now() THEN 'abierto' ELSE 'cerrado' END;
      INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
      VALUES (fase_label, 'fase', v_alcance, 20, v_estado, r.dl);
      created := created + 1;
    END IF;
  END LOOP;

  FOR r IN SELECT ((kickoff_time AT TIME ZONE 'UTC') - INTERVAL '4 hours')::date AS d,
                  MIN(kickoff_time) AS dl, bool_and(equipo_local = 'Por definir') AS undefined
           FROM public.matches GROUP BY 1 ORDER BY 1 LOOP
    v_alcance := jsonb_build_object('fecha', to_char(r.d,'YYYY-MM-DD'));
    IF NOT EXISTS (SELECT 1 FROM public.concursos WHERE alcance = v_alcance) THEN
      v_estado := CASE WHEN r.undefined THEN 'proximo' WHEN r.dl > now() THEN 'abierto' ELSE 'cerrado' END;
      v_nombre := 'Día de partidos — ' || to_char(r.d, 'DD Mon YYYY');
      INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
      VALUES (v_nombre, 'dia', v_alcance, 10, v_estado, r.dl);
      created := created + 1;
    END IF;
  END LOOP;

  IF _include_partidos THEN
    FOR r IN SELECT id, numero_partido, equipo_local, equipo_visitante, kickoff_time,
                    (equipo_local = 'Por definir') AS undefined
             FROM public.matches ORDER BY numero_partido LOOP
      v_alcance := jsonb_build_object('match_id', r.id);
      IF NOT EXISTS (SELECT 1 FROM public.concursos WHERE alcance = v_alcance) THEN
        v_estado := CASE WHEN r.undefined THEN 'proximo' WHEN r.kickoff_time > now() THEN 'abierto' ELSE 'cerrado' END;
        v_nombre := 'Partido #' || r.numero_partido || ' — ' || r.equipo_local || ' vs ' || r.equipo_visitante;
        INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
        VALUES (v_nombre, 'partido', v_alcance, 5, v_estado, r.kickoff_time);
        created := created + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN created;
END; $$;
GRANT EXECUTE ON FUNCTION public.generate_concursos(boolean) TO authenticated;

-- 9. Compatibility contest: "Fase de grupos" + auto-enroll approved participants
WITH c AS (
  INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
  SELECT 'Fase de grupos', 'fase', jsonb_build_object('fase','grupos'), 20,
    CASE WHEN (SELECT MIN(kickoff_time) FROM public.matches WHERE fase='grupos') > now() THEN 'abierto' ELSE 'cerrado' END,
    (SELECT MIN(kickoff_time) FROM public.matches WHERE fase='grupos')
  RETURNING id
)
INSERT INTO public.inscripciones(concurso_id, participant_id, estado_pago)
SELECT c.id, p.id, 'aprobado' FROM c CROSS JOIN public.participants p WHERE p.estado_pago = 'aprobado';