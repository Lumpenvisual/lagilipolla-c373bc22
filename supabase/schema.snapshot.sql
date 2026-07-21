-- AUTO-GENERATED snapshot · 2026-07-21T03:44:13Z
-- Fuente única de verdad: supabase/migrations/*.sql (NO editar este archivo)
-- Regenerar: bash scripts/dump_schema.sh


-- ============================================================
-- 20260604145233_9cf9b4e0-382e-484a-8c4c-43862741d563.sql
-- ============================================================

CREATE TYPE public.app_role AS ENUM ('admin','user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user_roles_own_read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user_roles_admin_read" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email = 'dgc75@hotmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

CREATE TABLE public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  estado_pago TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente','aprobado','rechazado')),
  comprobante_url TEXT,
  inscripcion_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.participants TO authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants_own_read" ON public.participants FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "participants_own_insert" ON public.participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND estado_pago = 'pendiente');
CREATE POLICY "participants_admin_all" ON public.participants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.matches (
  id SERIAL PRIMARY KEY,
  numero_partido INTEGER NOT NULL,
  jornada SMALLINT NOT NULL CHECK (jornada IN (1,2,3)),
  equipo_local VARCHAR(60) NOT NULL,
  equipo_visitante VARCHAR(60) NOT NULL,
  grupo CHAR(1) NOT NULL,
  estadio VARCHAR(80) NOT NULL,
  kickoff_time TIMESTAMPTZ NOT NULL,
  goles_local SMALLINT,
  goles_visitante SMALLINT
);
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matches_read_all" ON public.matches FOR SELECT USING (true);
CREATE POLICY "matches_admin_write" ON public.matches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  goles_local_pred SMALLINT,
  goles_visitante_pred SMALLINT,
  puntos_obtenidos SMALLINT NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, match_id)
);
GRANT SELECT, INSERT, UPDATE ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "predictions_own_read" ON public.predictions FOR SELECT TO authenticated
  USING (participant_id = (SELECT id FROM public.participants WHERE user_id = auth.uid()));
CREATE POLICY "predictions_own_insert" ON public.predictions FOR INSERT TO authenticated
  WITH CHECK (
    participant_id = (SELECT id FROM public.participants WHERE user_id = auth.uid())
    AND (SELECT kickoff_time FROM public.matches WHERE id = match_id) > now()
    AND (SELECT estado_pago FROM public.participants WHERE user_id = auth.uid()) = 'aprobado'
  );
CREATE POLICY "predictions_own_update" ON public.predictions FOR UPDATE TO authenticated
  USING (
    participant_id = (SELECT id FROM public.participants WHERE user_id = auth.uid())
    AND (SELECT kickoff_time FROM public.matches WHERE id = match_id) > now()
  );
CREATE POLICY "predictions_admin_all" ON public.predictions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.calc_points()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.predictions p
  SET puntos_obtenidos = CASE
    WHEN p.goles_local_pred = NEW.goles_local
     AND p.goles_visitante_pred = NEW.goles_visitante THEN 3
    WHEN SIGN(p.goles_local_pred - p.goles_visitante_pred)
       = SIGN(NEW.goles_local - NEW.goles_visitante) THEN 1
    ELSE 0
  END
  WHERE p.match_id = NEW.id
    AND p.goles_local_pred IS NOT NULL
    AND p.goles_visitante_pred IS NOT NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_calc_points
  AFTER UPDATE OF goles_local, goles_visitante ON public.matches
  FOR EACH ROW
  WHEN (NEW.goles_local IS NOT NULL AND NEW.goles_visitante IS NOT NULL)
  EXECUTE FUNCTION public.calc_points();

CREATE VIEW public.leaderboard AS
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
GRANT SELECT ON public.leaderboard TO anon, authenticated;

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
  WHERE EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id = _participant_id AND p.estado_pago = 'aprobado'
  )
  ORDER BY m.numero_partido;
$$;
GRANT EXECUTE ON FUNCTION public.get_participant_predictions(uuid) TO anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;

-- ============================================================
-- 20260604145312_ba134ad4-9a73-40ed-ad7c-0b4ce5aaa295.sql
-- ============================================================

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

-- ============================================================
-- 20260604145423_78358f4c-31e7-46c2-8451-e126814fb369.sql
-- ============================================================

CREATE POLICY "comprobantes_upload_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprobantes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "comprobantes_read_own_or_admin" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin'))
  );

CREATE POLICY "comprobantes_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 20260604150412_469160ff-c49e-4daa-b3f6-565020b419f7.sql
-- ============================================================
ALTER TABLE public.participants ADD COLUMN email TEXT;
-- ============================================================
-- 20260604160740_41210792-1564-446a-889b-a552b9e2578f.sql
-- ============================================================
ALTER TABLE public.participants DROP COLUMN IF EXISTS telefono;
-- ============================================================
-- 20260604161353_37dbcfe0-7dbb-4af1-a3c1-03cc5bdef29a.sql
-- ============================================================
ALTER TABLE public.participants DROP COLUMN IF EXISTS comprobante_url;
-- ============================================================
-- 20260607144548_986b6456-8c50-4cb7-8ff4-5025f60183d3.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;
-- ============================================================
-- 20260608025924_730e5b1a-36ea-42c0-b309-5f2aa4b06a1d.sql
-- ============================================================
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
-- ============================================================
-- 20260608030030_47f8cd32-c326-4596-bb5d-a44e2d0729c9.sql
-- ============================================================
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
-- ============================================================
-- 20260608090357_e45b2075-8b4d-494c-9479-4b92cdc95bb1.sql
-- ============================================================
DO $$
DECLARE
  r record;
  v_alcance jsonb; v_estado text; v_nombre text; fase_label text;
BEGIN
  -- Mundial completo
  v_alcance := jsonb_build_object('todos', true);
  IF NOT EXISTS (SELECT 1 FROM public.concursos WHERE alcance = v_alcance) THEN
    INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
    SELECT 'Mundial completo', 'mundial', v_alcance, 50,
      CASE WHEN MIN(kickoff_time) > now() THEN 'abierto' ELSE 'cerrado' END, MIN(kickoff_time)
    FROM public.matches;
  END IF;

  -- Por fase
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
    END IF;
  END LOOP;

  -- Día de partidos
  FOR r IN SELECT ((kickoff_time AT TIME ZONE 'UTC') - INTERVAL '4 hours')::date AS d,
                  MIN(kickoff_time) AS dl, bool_and(equipo_local = 'Por definir') AS undefined
           FROM public.matches GROUP BY 1 ORDER BY 1 LOOP
    v_alcance := jsonb_build_object('fecha', to_char(r.d,'YYYY-MM-DD'));
    IF NOT EXISTS (SELECT 1 FROM public.concursos WHERE alcance = v_alcance) THEN
      v_estado := CASE WHEN r.undefined THEN 'proximo' WHEN r.dl > now() THEN 'abierto' ELSE 'cerrado' END;
      v_nombre := 'Día de partidos — ' || to_char(r.d, 'DD Mon YYYY');
      INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
      VALUES (v_nombre, 'dia', v_alcance, 10, v_estado, r.dl);
    END IF;
  END LOOP;
END $$;
-- ============================================================
-- 20260608091303_d610f006-09f8-44fb-888a-08011611dbce.sql
-- ============================================================
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
-- ============================================================
-- 20260608093350_00d8418b-b040-43a0-af0d-2bf2bc37d0fe.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.selftest_concursos()
RETURNS TABLE(check_name text, passed boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  p3 uuid := gen_random_uuid();
  v_mid int; v_pts int;
  m_a int; m_b int; m_c int;
  v_match_id int; d1 int; d2 int;
  c_partido uuid; c_fase uuid; c_dia uuid; c_mundial uuid;
  v_cnt bigint; v_total bigint;
  v_p1pts bigint; v_p1ex bigint; v_p1pos bigint;
  v_p2pts bigint; v_p2ex bigint; v_p2pos bigint;
  v_p3cnt bigint;
  v_ov_part bigint; v_ov_play bigint;
  rec record;
  names text[] := '{}'; passes boolean[] := '{}'; details text[] := '{}';
  i int;
BEGIN
  BEGIN  -- subtransaction: everything inside is rolled back at the end
    -- ---- Fixtures: participants ----
    INSERT INTO participants(id, nombre, estado_pago) VALUES
      (p1, 'ST Alice', 'aprobado'),
      (p2, 'ST Bob', 'aprobado'),
      (p3, 'ST Carol', 'pendiente');

    -- ===== 1) Scoring trigger (3 / 1 / 0) =====
    FOR rec IN SELECT * FROM (VALUES
      (2,1, 2,1, 3, 'exacto (gana local)'),
      (1,0, 2,1, 1, 'acierta ganador local'),
      (0,2, 2,1, 0, 'falla ganador'),
      (3,1, 2,1, 1, 'gana local, marcador distinto'),
      (1,1, 2,2, 1, 'empate acertado, marcador distinto'),
      (2,2, 2,2, 3, 'empate exacto'),
      (5,0, 0,0, 0, 'predijo victoria, fue empate')
    ) AS t(pl,pv,rl,rv,expected,lbl)
    LOOP
      INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
        VALUES (901,1,'STL','STV','Z','ST Arena', now()+interval '40 days','selftest_score')
        RETURNING id INTO v_mid;
      INSERT INTO predictions(participant_id,match_id,goles_local_pred,goles_visitante_pred)
        VALUES (p1, v_mid, rec.pl, rec.pv);
      UPDATE matches SET goles_local=rec.rl, goles_visitante=rec.rv WHERE id=v_mid;
      SELECT puntos_obtenidos INTO v_pts FROM predictions WHERE participant_id=p1 AND match_id=v_mid;
      names := names || ('scoring: '||rec.lbl);
      passes := passes || (v_pts = rec.expected);
      details := details || format('pred %s-%s vs res %s-%s → esperado %s, obtuvo %s',
                                   rec.pl,rec.pv,rec.rl,rec.rv,rec.expected,v_pts);
    END LOOP;

    -- ===== 2) Scope per modalidad =====
    -- Phase matches (3) used by both scope and leaderboard tests
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (902,1,'A','B','Z','ST Arena', now()+interval '41 days','selftest_fase') RETURNING id INTO m_a;
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (903,1,'C','D','Z','ST Arena', now()+interval '42 days','selftest_fase') RETURNING id INTO m_b;
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (904,1,'E','F','Z','ST Arena', now()+interval '43 days','selftest_fase') RETURNING id INTO m_c;

    -- Single match for 'partido'
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (905,1,'G','H','Z','ST Arena', now()+interval '44 days','selftest_scope') RETURNING id INTO v_match_id;

    -- Two matches on a unique ET date 2030-01-15 (12:00Z - 4h = 08:00 → 2030-01-15)
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (906,1,'I','J','Z','ST Arena', '2030-01-15T12:00:00Z','selftest_scope') RETURNING id INTO d1;
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (907,1,'K','L','Z','ST Arena', '2030-01-15T20:00:00Z','selftest_scope') RETURNING id INTO d2;

    INSERT INTO concursos(nombre,modalidad,alcance,cuota,estado,deadline) VALUES
      ('ST partido','partido', jsonb_build_object('match_id', v_match_id), 5, 'abierto', now()+interval '44 days') RETURNING id INTO c_partido;
    INSERT INTO concursos(nombre,modalidad,alcance,cuota,estado,deadline) VALUES
      ('ST fase','fase', jsonb_build_object('fase','selftest_fase'), 20, 'abierto', now()+interval '41 days') RETURNING id INTO c_fase;
    INSERT INTO concursos(nombre,modalidad,alcance,cuota,estado,deadline) VALUES
      ('ST dia','dia', jsonb_build_object('fecha','2030-01-15'), 10, 'abierto', '2030-01-15T12:00:00Z') RETURNING id INTO c_dia;
    INSERT INTO concursos(nombre,modalidad,alcance,cuota,estado,deadline) VALUES
      ('ST mundial','mundial', jsonb_build_object('todos', true), 50, 'abierto', now()+interval '40 days') RETURNING id INTO c_mundial;

    SELECT count(*) INTO v_cnt FROM get_concurso_matches(c_partido);
    names := names||'scope partido = 1 partido'; passes := passes||(v_cnt=1); details := details||('obtuvo '||v_cnt);

    SELECT count(*) INTO v_cnt FROM get_concurso_matches(c_fase);
    names := names||'scope fase = 3 partidos'; passes := passes||(v_cnt=3); details := details||('obtuvo '||v_cnt);

    SELECT count(*) INTO v_cnt FROM get_concurso_matches(c_dia);
    names := names||'scope dia (ET) = 2 partidos'; passes := passes||(v_cnt=2); details := details||('obtuvo '||v_cnt);

    SELECT count(*) INTO v_total FROM matches;
    SELECT count(*) INTO v_cnt FROM get_concurso_matches(c_mundial);
    names := names||'scope mundial = todos los partidos'; passes := passes||(v_cnt=v_total);
    details := details||format('obtuvo %s de %s', v_cnt, v_total);

    -- ===== 3) Leaderboard per concurso (scope + only approved + ranking) =====
    INSERT INTO inscripciones(concurso_id,participant_id,estado_pago) VALUES
      (c_fase,p1,'aprobado'),(c_fase,p2,'aprobado'),(c_fase,p3,'pendiente');

    -- p1 already has out-of-scope (selftest_score) predictions worth points; they must NOT count here.
    INSERT INTO predictions(participant_id,match_id,goles_local_pred,goles_visitante_pred) VALUES
      (p1,m_a,2,1),(p1,m_b,0,0),(p1,m_c,0,0),
      (p2,m_a,1,0),(p2,m_b,1,1),(p2,m_c,1,2),
      (p3,m_a,2,1),(p3,m_b,0,0),(p3,m_c,1,2);

    UPDATE matches SET goles_local=2, goles_visitante=1 WHERE id=m_a; -- gana local
    UPDATE matches SET goles_local=0, goles_visitante=0 WHERE id=m_b; -- empate
    UPDATE matches SET goles_local=1, goles_visitante=2 WHERE id=m_c; -- gana visita

    -- Expected: p1 = 3(exacto)+3(exacto)+0 = 6 (exactos 2); p2 = 1+1+3 = 5 (exactos 1)
    SELECT count(*) INTO v_cnt FROM get_concurso_leaderboard(c_fase);
    names := names||'tabla: solo inscritos aprobados (2)'; passes := passes||(v_cnt=2); details := details||('filas '||v_cnt);

    SELECT count(*) INTO v_p3cnt FROM get_concurso_leaderboard(c_fase) WHERE participant_id=p3;
    names := names||'tabla: excluye pago pendiente'; passes := passes||(v_p3cnt=0); details := details||('filas p3 '||v_p3cnt);

    SELECT total_puntos,exactos,posicion INTO v_p1pts,v_p1ex,v_p1pos FROM get_concurso_leaderboard(c_fase) WHERE participant_id=p1;
    names := names||'tabla: puntos solo de partidos del concurso (p1=6)';
    passes := passes||(v_p1pts=6); details := details||('p1 puntos '||v_p1pts||' (fuera de alcance excluidos)');
    names := names||'tabla: exactos correctos (p1=2)'; passes := passes||(v_p1ex=2); details := details||('p1 exactos '||v_p1ex);

    SELECT total_puntos,exactos,posicion INTO v_p2pts,v_p2ex,v_p2pos FROM get_concurso_leaderboard(c_fase) WHERE participant_id=p2;
    names := names||'tabla: p2 puntos = 5'; passes := passes||(v_p2pts=5); details := details||('p2 puntos '||v_p2pts);

    names := names||'tabla: ranking (p1=1°, p2=2°)';
    passes := passes||(v_p1pos=1 AND v_p2pos=2); details := details||format('p1 pos %s, p2 pos %s', v_p1pos, v_p2pos);

    -- ===== 4) Lobby overview aggregates =====
    SELECT partidos,jugadores INTO v_ov_part,v_ov_play FROM get_concursos_overview() WHERE id=c_fase;
    names := names||'overview: partidos del concurso = 3'; passes := passes||(v_ov_part=3); details := details||('partidos '||v_ov_part);
    names := names||'overview: jugadores aprobados = 2'; passes := passes||(v_ov_play=2); details := details||('jugadores '||v_ov_play);

    RAISE EXCEPTION 'SELFTEST_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SELFTEST_DONE' THEN
      names := names||'ERROR INESPERADO'; passes := passes||false; details := details||SQLERRM;
    END IF;
  END;

  FOR i IN 1..array_length(names,1) LOOP
    check_name := names[i]; passed := passes[i]; detail := details[i];
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$fn$;

REVOKE ALL ON FUNCTION public.selftest_concursos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.selftest_concursos() TO service_role;

-- ============================================================
-- 20260608093503_db0c883d-abbc-49ee-a104-6fa9d34f563d.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.selftest_concursos()
RETURNS TABLE(check_name text, passed boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  p3 uuid := gen_random_uuid();
  v_mid int; v_pts int;
  m_a int; m_b int; m_c int;
  v_match_id int; d1 int; d2 int;
  c_partido uuid; c_fase uuid; c_dia uuid; c_mundial uuid;
  v_cnt bigint; v_total bigint;
  v_p1pts bigint; v_p1ex bigint; v_p1pos bigint;
  v_p2pts bigint; v_p2ex bigint; v_p2pos bigint;
  v_p3cnt bigint;
  v_ov_part bigint; v_ov_play bigint;
  rec record;
  names text[] := ARRAY[]::text[];
  passes boolean[] := ARRAY[]::boolean[];
  details text[] := ARRAY[]::text[];
  i int;
BEGIN
  BEGIN  -- subtransaction: everything inside is rolled back at the end
    INSERT INTO participants(id, nombre, estado_pago) VALUES
      (p1, 'ST Alice', 'aprobado'),
      (p2, 'ST Bob', 'aprobado'),
      (p3, 'ST Carol', 'pendiente');

    -- ===== 1) Scoring trigger (3 / 1 / 0) =====
    FOR rec IN SELECT * FROM (VALUES
      (2,1, 2,1, 3, 'exacto (gana local)'),
      (1,0, 2,1, 1, 'acierta ganador local'),
      (0,2, 2,1, 0, 'falla ganador'),
      (3,1, 2,1, 1, 'gana local, marcador distinto'),
      (1,1, 2,2, 1, 'empate acertado, marcador distinto'),
      (2,2, 2,2, 3, 'empate exacto'),
      (5,0, 0,0, 0, 'predijo victoria, fue empate')
    ) AS t(pl,pv,rl,rv,expected,lbl)
    LOOP
      INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
        VALUES (901,1,'STL','STV','Z','ST Arena', now()+interval '40 days','selftest_score')
        RETURNING id INTO v_mid;
      INSERT INTO predictions(participant_id,match_id,goles_local_pred,goles_visitante_pred)
        VALUES (p1, v_mid, rec.pl, rec.pv);
      UPDATE matches SET goles_local=rec.rl, goles_visitante=rec.rv WHERE id=v_mid;
      SELECT puntos_obtenidos INTO v_pts FROM predictions WHERE participant_id=p1 AND match_id=v_mid;
      names := array_append(names, 'scoring: '||rec.lbl);
      passes := array_append(passes, (v_pts = rec.expected));
      details := array_append(details, format('pred %s-%s vs res %s-%s → esperado %s, obtuvo %s',
                                   rec.pl,rec.pv,rec.rl,rec.rv,rec.expected,v_pts));
    END LOOP;

    -- ===== 2) Scope per modalidad =====
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (902,1,'A','B','Z','ST Arena', now()+interval '41 days','selftest_fase') RETURNING id INTO m_a;
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (903,1,'C','D','Z','ST Arena', now()+interval '42 days','selftest_fase') RETURNING id INTO m_b;
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (904,1,'E','F','Z','ST Arena', now()+interval '43 days','selftest_fase') RETURNING id INTO m_c;

    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (905,1,'G','H','Z','ST Arena', now()+interval '44 days','selftest_scope') RETURNING id INTO v_match_id;

    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (906,1,'I','J','Z','ST Arena', '2030-01-15T12:00:00Z','selftest_scope') RETURNING id INTO d1;
    INSERT INTO matches(numero_partido,jornada,equipo_local,equipo_visitante,grupo,estadio,kickoff_time,fase)
      VALUES (907,1,'K','L','Z','ST Arena', '2030-01-15T20:00:00Z','selftest_scope') RETURNING id INTO d2;

    INSERT INTO concursos(nombre,modalidad,alcance,cuota,estado,deadline) VALUES
      ('ST partido','partido', jsonb_build_object('match_id', v_match_id), 5, 'abierto', now()+interval '44 days') RETURNING id INTO c_partido;
    INSERT INTO concursos(nombre,modalidad,alcance,cuota,estado,deadline) VALUES
      ('ST fase','fase', jsonb_build_object('fase','selftest_fase'), 20, 'abierto', now()+interval '41 days') RETURNING id INTO c_fase;
    INSERT INTO concursos(nombre,modalidad,alcance,cuota,estado,deadline) VALUES
      ('ST dia','dia', jsonb_build_object('fecha','2030-01-15'), 10, 'abierto', '2030-01-15T12:00:00Z') RETURNING id INTO c_dia;
    INSERT INTO concursos(nombre,modalidad,alcance,cuota,estado,deadline) VALUES
      ('ST mundial','mundial', jsonb_build_object('todos', true), 50, 'abierto', now()+interval '40 days') RETURNING id INTO c_mundial;

    SELECT count(*) INTO v_cnt FROM get_concurso_matches(c_partido);
    names := array_append(names,'scope partido = 1 partido'); passes := array_append(passes,(v_cnt=1)); details := array_append(details,'obtuvo '||v_cnt);

    SELECT count(*) INTO v_cnt FROM get_concurso_matches(c_fase);
    names := array_append(names,'scope fase = 3 partidos'); passes := array_append(passes,(v_cnt=3)); details := array_append(details,'obtuvo '||v_cnt);

    SELECT count(*) INTO v_cnt FROM get_concurso_matches(c_dia);
    names := array_append(names,'scope dia (ET) = 2 partidos'); passes := array_append(passes,(v_cnt=2)); details := array_append(details,'obtuvo '||v_cnt);

    SELECT count(*) INTO v_total FROM matches;
    SELECT count(*) INTO v_cnt FROM get_concurso_matches(c_mundial);
    names := array_append(names,'scope mundial = todos los partidos'); passes := array_append(passes,(v_cnt=v_total));
    details := array_append(details, format('obtuvo %s de %s', v_cnt, v_total));

    -- ===== 3) Leaderboard per concurso =====
    INSERT INTO inscripciones(concurso_id,participant_id,estado_pago) VALUES
      (c_fase,p1,'aprobado'),(c_fase,p2,'aprobado'),(c_fase,p3,'pendiente');

    INSERT INTO predictions(participant_id,match_id,goles_local_pred,goles_visitante_pred) VALUES
      (p1,m_a,2,1),(p1,m_b,0,0),(p1,m_c,0,0),
      (p2,m_a,1,0),(p2,m_b,1,1),(p2,m_c,1,2),
      (p3,m_a,2,1),(p3,m_b,0,0),(p3,m_c,1,2);

    UPDATE matches SET goles_local=2, goles_visitante=1 WHERE id=m_a;
    UPDATE matches SET goles_local=0, goles_visitante=0 WHERE id=m_b;
    UPDATE matches SET goles_local=1, goles_visitante=2 WHERE id=m_c;

    SELECT count(*) INTO v_cnt FROM get_concurso_leaderboard(c_fase);
    names := array_append(names,'tabla: solo inscritos aprobados (2)'); passes := array_append(passes,(v_cnt=2)); details := array_append(details,'filas '||v_cnt);

    SELECT count(*) INTO v_p3cnt FROM get_concurso_leaderboard(c_fase) WHERE participant_id=p3;
    names := array_append(names,'tabla: excluye pago pendiente'); passes := array_append(passes,(v_p3cnt=0)); details := array_append(details,'filas p3 '||v_p3cnt);

    SELECT total_puntos,exactos,posicion INTO v_p1pts,v_p1ex,v_p1pos FROM get_concurso_leaderboard(c_fase) WHERE participant_id=p1;
    names := array_append(names,'tabla: puntos solo de partidos del concurso (p1=6)');
    passes := array_append(passes,(v_p1pts=6)); details := array_append(details,'p1 puntos '||v_p1pts||' (fuera de alcance excluidos)');
    names := array_append(names,'tabla: exactos correctos (p1=2)'); passes := array_append(passes,(v_p1ex=2)); details := array_append(details,'p1 exactos '||v_p1ex);

    SELECT total_puntos,exactos,posicion INTO v_p2pts,v_p2ex,v_p2pos FROM get_concurso_leaderboard(c_fase) WHERE participant_id=p2;
    names := array_append(names,'tabla: p2 puntos = 5'); passes := array_append(passes,(v_p2pts=5)); details := array_append(details,'p2 puntos '||v_p2pts);

    names := array_append(names,'tabla: ranking (p1=1°, p2=2°)');
    passes := array_append(passes,(v_p1pos=1 AND v_p2pos=2)); details := array_append(details, format('p1 pos %s, p2 pos %s', v_p1pos, v_p2pos));

    -- ===== 4) Lobby overview aggregates =====
    SELECT partidos,jugadores INTO v_ov_part,v_ov_play FROM get_concursos_overview() WHERE id=c_fase;
    names := array_append(names,'overview: partidos del concurso = 3'); passes := array_append(passes,(v_ov_part=3)); details := array_append(details,'partidos '||v_ov_part);
    names := array_append(names,'overview: jugadores aprobados = 2'); passes := array_append(passes,(v_ov_play=2)); details := array_append(details,'jugadores '||v_ov_play);

    RAISE EXCEPTION 'SELFTEST_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SELFTEST_DONE' THEN
      names := array_append(names,'ERROR INESPERADO'); passes := array_append(passes,false); details := array_append(details,SQLERRM);
    END IF;
  END;

  FOR i IN 1..COALESCE(array_length(names,1),0) LOOP
    check_name := names[i]; passed := passes[i]; detail := details[i];
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$fn$;

REVOKE ALL ON FUNCTION public.selftest_concursos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.selftest_concursos() TO service_role;

-- ============================================================
-- 20260608122736_bc2a4da8-425e-4ccb-a7a9-93671b150103.sql
-- ============================================================
-- Demo data tooling: tracking table + parameterizable seeder + reset.

CREATE TABLE IF NOT EXISTS public.demo_seed (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  ref_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.demo_seed TO service_role;
ALTER TABLE public.demo_seed ENABLE ROW LEVEL SECURITY;
-- No policies: only reachable via SECURITY DEFINER functions below.

-- ============ Seeder ============
CREATE OR REPLACE FUNCTION public.seed_demo_data(
  _players integer DEFAULT 8,
  _result_pct integer DEFAULT 60,
  _include_partidos boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_names text[] := ARRAY['Sofía','Mateo','Valentina','Liam','Camila','Noah','Isabella','Lucas','Emma','Diego',
                          'Olivia','Hugo','Martina','Léo','Lucía','Gabriel','Julie','Daniel','Paula','Adrián'];
  v_created_players int := 0;
  v_preds int := 0;
  v_insc int := 0;
  v_results int := 0;
  v_contests int := 0;
  v_pid uuid;
  v_estado text;
  v_n int;
  mrec record;
  v_gl int; v_gv int;
  i int;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  _players := GREATEST(1, LEAST(COALESCE(_players,8), 20));
  _result_pct := GREATEST(0, LEAST(COALESCE(_result_pct,60), 100));

  -- 1) Ensure contests exist for every modality (idempotent).
  v_contests := public.generate_concursos(_include_partidos);

  -- 2) Demo participants (identified by the [DEMO] prefix for clean reset).
  FOR i IN 1.._players LOOP
    v_estado := CASE WHEN i % 7 = 0 THEN 'rechazado'
                     WHEN i % 5 = 0 THEN 'pendiente'
                     ELSE 'aprobado' END;
    INSERT INTO participants(nombre, estado_pago)
      VALUES ('[DEMO] ' || v_names[((i-1) % array_length(v_names,1)) + 1] || ' ' || i, v_estado)
      RETURNING id INTO v_pid;
    v_created_players := v_created_players + 1;

    -- 3) Enroll in every contest with a realistic payment mix.
    INSERT INTO inscripciones(concurso_id, participant_id, estado_pago)
      SELECT c.id, v_pid,
        CASE WHEN v_estado = 'aprobado'
             THEN (CASE WHEN random() < 0.8 THEN 'aprobado'
                        WHEN random() < 0.5 THEN 'pendiente'
                        ELSE 'rechazado' END)
             ELSE v_estado END
      FROM concursos c;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_insc := v_insc + v_n;

    -- 4) Invented predictions for every match with defined teams.
    INSERT INTO predictions(participant_id, match_id, goles_local_pred, goles_visitante_pred)
      SELECT v_pid, m.id, floor(random()*4)::int, floor(random()*4)::int
      FROM matches m
      WHERE m.equipo_local <> 'Por definir' AND m.equipo_visitante <> 'Por definir'
      ON CONFLICT (participant_id, match_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_preds := v_preds + v_n;
  END LOOP;

  -- 5) Invent results for a percentage of not-yet-played matches (triggers scoring).
  FOR mrec IN
    SELECT id FROM matches
    WHERE equipo_local <> 'Por definir' AND equipo_visitante <> 'Por definir'
      AND goles_local IS NULL
      AND random()*100 < _result_pct
  LOOP
    v_gl := floor(random()*4)::int;
    v_gv := floor(random()*4)::int;
    UPDATE matches SET goles_local = v_gl, goles_visitante = v_gv WHERE id = mrec.id;
    INSERT INTO demo_seed(kind, ref_id) VALUES ('match_result', mrec.id::text);
    v_results := v_results + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'players', v_created_players,
    'enrollments', v_insc,
    'predictions', v_preds,
    'results', v_results,
    'contests_created', v_contests
  );
END;
$$;

-- ============ Reset ============
CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_players int := 0; v_preds int := 0; v_insc int := 0; v_results int := 0;
  v_n int; mrec record;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Revert invented match results (re-triggers scoring back to 0).
  FOR mrec IN SELECT ref_id::int AS mid FROM demo_seed WHERE kind = 'match_result' LOOP
    UPDATE matches SET goles_local = NULL, goles_visitante = NULL WHERE id = mrec.mid;
    v_results := v_results + 1;
  END LOOP;
  DELETE FROM demo_seed WHERE kind = 'match_result';

  -- Remove demo participants and their data.
  DELETE FROM predictions WHERE participant_id IN
    (SELECT id FROM participants WHERE nombre LIKE '[DEMO] %');
  GET DIAGNOSTICS v_preds = ROW_COUNT;

  DELETE FROM inscripciones WHERE participant_id IN
    (SELECT id FROM participants WHERE nombre LIKE '[DEMO] %');
  GET DIAGNOSTICS v_insc = ROW_COUNT;

  DELETE FROM participants WHERE nombre LIKE '[DEMO] %';
  GET DIAGNOSTICS v_players = ROW_COUNT;

  RETURN jsonb_build_object(
    'players', v_players,
    'enrollments', v_insc,
    'predictions', v_preds,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_data(integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_data(integer, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO authenticated, service_role;
-- ============================================================
-- 20260608144332_125feb79-1919-4265-9a7e-997f77e9c162.sql
-- ============================================================
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
-- ============================================================
-- 20260608144447_ebc7008f-49fe-4378-89f7-b46a568198f2.sql
-- ============================================================
-- Internal/admin & trigger functions: remove the implicit PUBLIC EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.calc_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_concursos(boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_demo_data(integer, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.selftest_concursos() FROM PUBLIC, anon, authenticated;

-- Participant predictions: signed-in only (close the implicit PUBLIC/anon grant).
REVOKE EXECUTE ON FUNCTION public.get_participant_predictions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_participant_predictions(uuid) TO authenticated;
-- ============================================================
-- 20260608151444_fbf31cba-d93c-48e4-a668-0b2b35d8718a.sql
-- ============================================================
DELETE FROM public.predictions WHERE participant_id IN (SELECT id FROM public.participants WHERE nombre = 'qa_e2e_check');
DELETE FROM public.inscripciones WHERE participant_id IN (SELECT id FROM public.participants WHERE nombre = 'qa_e2e_check');
DELETE FROM public.participants WHERE nombre = 'qa_e2e_check';
DELETE FROM auth.users WHERE email = 'qa.e2e.check@polla.local';
-- ============================================================
-- 20260608183924_4b66cd39-df5c-4e06-8cc7-661ab31b8a41.sql
-- ============================================================

-- ============================================================================
-- 1) Add celular column to participants (idempotent)
-- ============================================================================
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS celular text;

-- ============================================================================
-- 2) tournament_state (singleton id=1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tournament_state (
  id smallint PRIMARY KEY DEFAULT 1,
  groups jsonb NOT NULL DEFAULT '{}'::jsonb,
  group_k_matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  goleadores jsonb NOT NULL DEFAULT '[]'::jsonb,
  arqueros jsonb NOT NULL DEFAULT '[]'::jsonb,
  goleador_id text,
  arquero_id text,
  deadline timestamptz NOT NULL DEFAULT '2026-06-11T17:00:00-05:00',
  cuota_cop integer NOT NULL DEFAULT 100000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_state_singleton CHECK (id = 1)
);

GRANT SELECT ON public.tournament_state TO anon, authenticated;
GRANT ALL ON public.tournament_state TO service_role;
ALTER TABLE public.tournament_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ts_public_read" ON public.tournament_state;
CREATE POLICY "ts_public_read" ON public.tournament_state
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "ts_admin_write" ON public.tournament_state;
CREATE POLICY "ts_admin_write" ON public.tournament_state
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- 3) picks (one row per participant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.picks (
  participant_id uuid PRIMARY KEY REFERENCES public.participants(id) ON DELETE CASCADE,
  groups jsonb NOT NULL DEFAULT '{}'::jsonb,
  group_k_matches jsonb NOT NULL DEFAULT '{}'::jsonb,
  goleador_id text,
  arquero_id text,
  puntos_grupos integer NOT NULL DEFAULT 0,
  puntos_partidos integer NOT NULL DEFAULT 0,
  puntos_especiales integer NOT NULL DEFAULT 0,
  puntos_total integer GENERATED ALWAYS AS (puntos_grupos + puntos_partidos + puntos_especiales) STORED,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.picks TO authenticated;
GRANT ALL ON public.picks TO service_role;
ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "picks_own_read" ON public.picks;
CREATE POLICY "picks_own_read" ON public.picks
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = participant_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "picks_own_write" ON public.picks;
CREATE POLICY "picks_own_write" ON public.picks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id
        AND p.user_id = auth.uid()
        AND p.estado_pago = 'aprobado'
    )
  );

DROP POLICY IF EXISTS "picks_own_update" ON public.picks;
CREATE POLICY "picks_own_update" ON public.picks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id
        AND p.user_id = auth.uid()
        AND p.estado_pago = 'aprobado'
    )
    AND (SELECT deadline FROM public.tournament_state WHERE id = 1) > now()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id
        AND p.user_id = auth.uid()
        AND p.estado_pago = 'aprobado'
    )
  );

DROP POLICY IF EXISTS "picks_admin_all" ON public.picks;
CREATE POLICY "picks_admin_all" ON public.picks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER picks_updated_at BEFORE UPDATE ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ts_updated_at BEFORE UPDATE ON public.tournament_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4) Scoring functions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calc_pick_points(_pick_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  p record;
  k text;
  gobj jsonb;
  pos1_o text; pos2_o text;
  pos1_p text; pos2_p text;
  pts_g int := 0; pts_m int := 0; pts_e int := 0;
  match_o jsonb; match_p jsonb;
  oh int; oa int; ph int; pa int;
  sign_o int; sign_p int;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.picks WHERE participant_id = _pick_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  -- Groups
  FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
    gobj := s.groups->k;
    pos1_o := gobj->>'pos1';
    pos2_o := gobj->>'pos2';
    pos1_p := (p.groups->k)->>'pos1';
    pos2_p := (p.groups->k)->>'pos2';
    IF pos1_o IS NULL OR pos2_o IS NULL OR pos1_p IS NULL OR pos2_p IS NULL THEN
      CONTINUE;
    END IF;
    IF pos1_p = pos1_o AND pos2_p = pos2_o THEN
      pts_g := pts_g + 5;
    ELSIF pos1_p = pos2_o AND pos2_p = pos1_o THEN
      pts_g := pts_g + 3;
    ELSIF pos1_p = pos1_o OR pos1_p = pos2_o OR pos2_p = pos1_o OR pos2_p = pos2_o THEN
      pts_g := pts_g + 1;
    END IF;
  END LOOP;

  -- Group K matches
  FOR match_o IN SELECT jsonb_array_elements(s.group_k_matches) LOOP
    oh := NULLIF(match_o->>'gh','')::int;
    oa := NULLIF(match_o->>'ga','')::int;
    IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
    match_p := p.group_k_matches -> (match_o->>'id');
    IF match_p IS NULL THEN CONTINUE; END IF;
    ph := NULLIF(match_p->>'gh','')::int;
    pa := NULLIF(match_p->>'ga','')::int;
    IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
    sign_o := sign(oh - oa);
    sign_p := sign(ph - pa);
    IF ph = oh AND pa = oa THEN
      pts_m := pts_m + 5;
    ELSIF sign_p = sign_o AND (ph - pa) = (oh - oa) THEN
      pts_m := pts_m + 3;
    ELSIF sign_p = sign_o THEN
      pts_m := pts_m + 2;
    ELSIF ph = oh OR pa = oa THEN
      pts_m := pts_m + 1;
    END IF;
  END LOOP;

  -- Specials
  IF s.goleador_id IS NOT NULL AND p.goleador_id = s.goleador_id THEN
    pts_e := pts_e + 10;
  END IF;
  IF s.arquero_id IS NOT NULL AND p.arquero_id = s.arquero_id THEN
    pts_e := pts_e + 10;
  END IF;

  UPDATE public.picks SET
    puntos_grupos = pts_g,
    puntos_partidos = pts_m,
    puntos_especiales = pts_e
  WHERE participant_id = _pick_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_all_picks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; n int := 0;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR r IN SELECT participant_id FROM public.picks LOOP
    PERFORM public.calc_pick_points(r.participant_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

-- Trigger: recalc on own pick save
CREATE OR REPLACE FUNCTION public.picks_recalc_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.calc_pick_points(NEW.participant_id);
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS picks_recalc_after_change ON public.picks;
CREATE TRIGGER picks_recalc_after_change
  AFTER INSERT OR UPDATE OF groups, group_k_matches, goleador_id, arquero_id
  ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.picks_recalc_trigger();

-- ============================================================================
-- 5) Public leaderboard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_polla_leaderboard()
RETURNS TABLE(
  participant_id uuid,
  nombre text,
  puntos_grupos integer,
  puntos_partidos integer,
  puntos_especiales integer,
  puntos_total integer,
  posicion bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pa.id,
    pa.nombre,
    COALESCE(pk.puntos_grupos, 0),
    COALESCE(pk.puntos_partidos, 0),
    COALESCE(pk.puntos_especiales, 0),
    COALESCE(pk.puntos_total, 0),
    RANK() OVER (ORDER BY COALESCE(pk.puntos_total, 0) DESC)
  FROM public.participants pa
  LEFT JOIN public.picks pk ON pk.participant_id = pa.id
  WHERE pa.estado_pago = 'aprobado';
$$;

GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated;

-- ============================================================================
-- 6) Seed singleton tournament_state with OFFICIAL draw data (5 Dec 2025)
-- ============================================================================
INSERT INTO public.tournament_state (id, groups, group_k_matches, goleadores, arqueros)
VALUES (
  1,
  $JSON$
  {
    "A": {"teams":[
      {"id":"MEX","nombre":"México"},
      {"id":"RSA","nombre":"Sudáfrica"},
      {"id":"KOR","nombre":"Corea del Sur"},
      {"id":"UEFA-D","nombre":"Ganador Repechaje UEFA D","po":"UEFA-D","candidatos":[{"id":"DEN","n":"Dinamarca"},{"id":"CZE","n":"Chequia"},{"id":"IRL","n":"Irlanda"},{"id":"MKD","n":"Macedonia del Norte"}]}
    ],"pos1":null,"pos2":null},
    "B": {"teams":[
      {"id":"CAN","nombre":"Canadá"},
      {"id":"UEFA-A","nombre":"Ganador Repechaje UEFA A","po":"UEFA-A","candidatos":[{"id":"ITA","n":"Italia"},{"id":"WAL","n":"Gales"},{"id":"BIH","n":"Bosnia y H."},{"id":"NIR","n":"Irlanda del N."}]},
      {"id":"QAT","nombre":"Catar"},
      {"id":"SUI","nombre":"Suiza"}
    ],"pos1":null,"pos2":null},
    "C": {"teams":[
      {"id":"BRA","nombre":"Brasil"},
      {"id":"MAR","nombre":"Marruecos"},
      {"id":"HAI","nombre":"Haití"},
      {"id":"SCO","nombre":"Escocia"}
    ],"pos1":null,"pos2":null},
    "D": {"teams":[
      {"id":"USA","nombre":"Estados Unidos"},
      {"id":"PAR","nombre":"Paraguay"},
      {"id":"AUS","nombre":"Australia"},
      {"id":"UEFA-C","nombre":"Ganador Repechaje UEFA C","po":"UEFA-C","candidatos":[{"id":"TUR","n":"Turquía"},{"id":"SVK","n":"Eslovaquia"},{"id":"KOS","n":"Kosovo"},{"id":"ROU","n":"Rumania"}]}
    ],"pos1":null,"pos2":null},
    "E": {"teams":[
      {"id":"GER","nombre":"Alemania"},
      {"id":"CUW","nombre":"Curazao"},
      {"id":"CIV","nombre":"Costa de Marfil"},
      {"id":"ECU","nombre":"Ecuador"}
    ],"pos1":null,"pos2":null},
    "F": {"teams":[
      {"id":"NED","nombre":"Países Bajos"},
      {"id":"JPN","nombre":"Japón"},
      {"id":"UEFA-B","nombre":"Ganador Repechaje UEFA B","po":"UEFA-B","candidatos":[{"id":"UKR","n":"Ucrania"},{"id":"POL","n":"Polonia"},{"id":"ALB","n":"Albania"},{"id":"SWE","n":"Suecia"}]},
      {"id":"TUN","nombre":"Túnez"}
    ],"pos1":null,"pos2":null},
    "G": {"teams":[
      {"id":"BEL","nombre":"Bélgica"},
      {"id":"EGY","nombre":"Egipto"},
      {"id":"IRN","nombre":"Irán"},
      {"id":"NZL","nombre":"Nueva Zelanda"}
    ],"pos1":null,"pos2":null},
    "H": {"teams":[
      {"id":"ESP","nombre":"España"},
      {"id":"CPV","nombre":"Cabo Verde"},
      {"id":"KSA","nombre":"Arabia Saudita"},
      {"id":"URU","nombre":"Uruguay"}
    ],"pos1":null,"pos2":null},
    "I": {"teams":[
      {"id":"FRA","nombre":"Francia"},
      {"id":"SEN","nombre":"Senegal"},
      {"id":"FIFA-2","nombre":"Ganador Repechaje FIFA 2","po":"FIFA-2","candidatos":[{"id":"IRQ","n":"Irak"},{"id":"BOL","n":"Bolivia"},{"id":"SUR","n":"Surinam"}]},
      {"id":"NOR","nombre":"Noruega"}
    ],"pos1":null,"pos2":null},
    "J": {"teams":[
      {"id":"ARG","nombre":"Argentina"},
      {"id":"ALG","nombre":"Argelia"},
      {"id":"AUT","nombre":"Austria"},
      {"id":"JOR","nombre":"Jordania"}
    ],"pos1":null,"pos2":null},
    "K": {"teams":[
      {"id":"POR","nombre":"Portugal"},
      {"id":"FIFA-1","nombre":"Ganador Repechaje FIFA 1","po":"FIFA-1","candidatos":[{"id":"COD","n":"RD Congo"},{"id":"JAM","n":"Jamaica"},{"id":"NCL","n":"Nueva Caledonia"}]},
      {"id":"UZB","nombre":"Uzbekistán"},
      {"id":"COL","nombre":"Colombia"}
    ],"pos1":null,"pos2":null},
    "L": {"teams":[
      {"id":"ENG","nombre":"Inglaterra"},
      {"id":"CRO","nombre":"Croacia"},
      {"id":"GHA","nombre":"Ghana"},
      {"id":"PAN","nombre":"Panamá"}
    ],"pos1":null,"pos2":null}
  }
  $JSON$::jsonb,
  $JSON$
  [
    {"id":"1","fecha":"2026-06-17T21:00:00-05:00","local":"UZB","visitante":"COL","sede":"Estadio Azteca · Ciudad de México","gh":null,"ga":null},
    {"id":"2","fecha":"2026-06-17T13:00:00-05:00","local":"POR","visitante":"FIFA-1","sede":"Sede por confirmar","gh":null,"ga":null},
    {"id":"3","fecha":"2026-06-23T21:00:00-05:00","local":"COL","visitante":"FIFA-1","sede":"Estadio Akron · Guadalajara","gh":null,"ga":null},
    {"id":"4","fecha":"2026-06-23T13:00:00-05:00","local":"POR","visitante":"UZB","sede":"Sede por confirmar","gh":null,"ga":null},
    {"id":"5","fecha":"2026-06-27T18:30:00-05:00","local":"COL","visitante":"POR","sede":"Hard Rock Stadium · Miami","gh":null,"ga":null},
    {"id":"6","fecha":"2026-06-27T13:00:00-05:00","local":"UZB","visitante":"FIFA-1","sede":"Sede por confirmar","gh":null,"ga":null}
  ]
  $JSON$::jsonb,
  $JSON$
  [
    {"id":"mbappe","nombre":"Kylian Mbappé","seleccion":"Francia"},
    {"id":"haaland","nombre":"Erling Haaland","seleccion":"Noruega"},
    {"id":"vinicius","nombre":"Vinícius Jr.","seleccion":"Brasil"},
    {"id":"lautaro","nombre":"Lautaro Martínez","seleccion":"Argentina"},
    {"id":"kane","nombre":"Harry Kane","seleccion":"Inglaterra"},
    {"id":"yamal","nombre":"Lamine Yamal","seleccion":"España"},
    {"id":"cristiano","nombre":"Cristiano Ronaldo","seleccion":"Portugal"},
    {"id":"messi","nombre":"Lionel Messi","seleccion":"Argentina"},
    {"id":"luisdiaz","nombre":"Luis Díaz","seleccion":"Colombia"},
    {"id":"james","nombre":"James Rodríguez","seleccion":"Colombia"}
  ]
  $JSON$::jsonb,
  $JSON$
  [
    {"id":"courtois","nombre":"Thibaut Courtois","seleccion":"Bélgica"},
    {"id":"donnarumma","nombre":"Gianluigi Donnarumma","seleccion":"Italia"},
    {"id":"alisson","nombre":"Alisson Becker","seleccion":"Brasil"},
    {"id":"emi","nombre":"Emiliano Martínez","seleccion":"Argentina"},
    {"id":"maignan","nombre":"Mike Maignan","seleccion":"Francia"},
    {"id":"diogocosta","nombre":"Diogo Costa","seleccion":"Portugal"},
    {"id":"sommer","nombre":"Yann Sommer","seleccion":"Suiza"},
    {"id":"vargas","nombre":"Camilo Vargas","seleccion":"Colombia"}
  ]
  $JSON$::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  groups = EXCLUDED.groups,
  group_k_matches = EXCLUDED.group_k_matches,
  goleadores = EXCLUDED.goleadores,
  arqueros = EXCLUDED.arqueros;

-- ============================================================
-- 20260608191518_ab33f535-45b2-4bde-b645-23c112e6b755.sql
-- ============================================================

-- 1) Admin user genérico + 6 usuarios demo
DO $$
DECLARE
  v_admin_id uuid;
  v_demo_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_names text[] := ARRAY['Sofía Restrepo','Mateo Gómez','Valentina Ruiz','Andrés Cárdenas','Camila Ortiz','Diego Marín'];
  v_email text;
  i int;
BEGIN
  -- ADMIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@gilipolla.co') THEN
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated',
      'admin@gilipolla.co', crypt(COALESCE(current_setting('app.admin_seed_password', true), 'CHANGE_ME_VIA_DASHBOARD_' || gen_random_uuid()::text), gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nombre":"Admin Guanábano"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@gilipolla.co'),
      'email', v_admin_id::text, now(), now(), now());
    INSERT INTO public.user_roles (user_id, role) VALUES (v_admin_id, 'admin')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.participants (user_id, nombre, email, estado_pago)
      VALUES (v_admin_id, 'Admin Guanábano', 'admin@gilipolla.co', 'aprobado')
      ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- 6 usuarios demo
  FOR i IN 1..6 LOOP
    v_email := 'demo' || i || '@gilipolla.co';
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      v_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        v_email, crypt('Demo2026!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('nombre', v_names[i]),
        now(), now(), '', '', '', ''
      );
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email),
        'email', v_id::text, now(), now(), now());
      INSERT INTO public.participants (user_id, nombre, email, estado_pago)
        VALUES (v_id, '[DEMO] ' || v_names[i], v_email, 'aprobado');
    END IF;
  END LOOP;
END $$;

-- 2) Función para sembrar picks demo (planillas inventadas para los [DEMO])
CREATE OR REPLACE FUNCTION public.seed_polla_demo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  p record;
  k text;
  gobj jsonb;
  team_ids text[];
  pick_groups jsonb;
  pick_matches jsonb;
  match_o jsonb;
  gols text[]; arqs text[];
  n int := 0;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  IF s IS NULL THEN RAISE EXCEPTION 'tournament_state vacío'; END IF;

  SELECT array_agg(id) INTO gols FROM jsonb_to_recordset(s.goleadores) AS x(id text);
  SELECT array_agg(id) INTO arqs FROM jsonb_to_recordset(s.arqueros)  AS x(id text);

  FOR p IN SELECT id FROM public.participants WHERE nombre LIKE '[DEMO]%' AND estado_pago = 'aprobado' LOOP
    pick_groups := '{}'::jsonb;
    FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
      gobj := s.groups->k;
      SELECT array_agg(t->>'id') INTO team_ids FROM jsonb_array_elements(gobj->'teams') t;
      pick_groups := pick_groups || jsonb_build_object(k, jsonb_build_object(
        'pos1', team_ids[1 + floor(random()*array_length(team_ids,1))::int],
        'pos2', team_ids[1 + floor(random()*array_length(team_ids,1))::int]
      ));
    END LOOP;

    pick_matches := '{}'::jsonb;
    FOR match_o IN SELECT jsonb_array_elements(s.group_k_matches) LOOP
      pick_matches := pick_matches || jsonb_build_object(match_o->>'id', jsonb_build_object(
        'gh', floor(random()*4)::int, 'ga', floor(random()*4)::int
      ));
    END LOOP;

    INSERT INTO public.picks (participant_id, groups, group_k_matches, goleador_id, arquero_id)
    VALUES (
      p.id, pick_groups, pick_matches,
      CASE WHEN gols IS NOT NULL AND array_length(gols,1) > 0 THEN gols[1 + floor(random()*array_length(gols,1))::int] ELSE NULL END,
      CASE WHEN arqs IS NOT NULL AND array_length(arqs,1) > 0 THEN arqs[1 + floor(random()*array_length(arqs,1))::int] ELSE NULL END
    )
    ON CONFLICT (participant_id) DO UPDATE SET
      groups = EXCLUDED.groups,
      group_k_matches = EXCLUDED.group_k_matches,
      goleador_id = EXCLUDED.goleador_id,
      arquero_id = EXCLUDED.arquero_id;
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('picks_demo', n);
END $$;

-- 3) Función para borrar TODA la data demo (participants [DEMO] + sus picks + sus auth.users)
CREATE OR REPLACE FUNCTION public.reset_polla_demo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_users int := 0; v_parts int := 0;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- Borrar usuarios auth con email demoN@gilipolla.co cascade → elimina participants + picks
  WITH d AS (DELETE FROM auth.users WHERE email LIKE 'demo%@gilipolla.co' RETURNING 1)
  SELECT count(*) INTO v_users FROM d;
  -- Por si quedaron participants [DEMO] sin user_id
  WITH d AS (DELETE FROM public.participants WHERE nombre LIKE '[DEMO]%' RETURNING 1)
  SELECT count(*) INTO v_parts FROM d;
  RETURN jsonb_build_object('auth_users', v_users, 'participants_huérfanos', v_parts);
END $$;

GRANT EXECUTE ON FUNCTION public.seed_polla_demo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_polla_demo() TO authenticated;

-- ============================================================
-- 20260608205844_14dcedac-a584-450d-b5ed-2dd1ad302571.sql
-- ============================================================

-- ============ 1) DROP LEGACY ============
DROP FUNCTION IF EXISTS public.get_concurso_matches(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.calc_points() CASCADE;
DROP FUNCTION IF EXISTS public.generate_concursos(boolean) CASCADE;
DROP FUNCTION IF EXISTS public.get_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.get_concurso_leaderboard(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_concursos_overview() CASCADE;
DROP FUNCTION IF EXISTS public.get_participant_predictions(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.seed_demo_data(integer, integer, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.reset_demo_data() CASCADE;
DROP FUNCTION IF EXISTS public.selftest_concursos() CASCADE;

DROP TABLE IF EXISTS public.predictions CASCADE;
DROP TABLE IF EXISTS public.inscripciones CASCADE;
DROP TABLE IF EXISTS public.concursos CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.demo_seed CASCADE;

-- ============ 2) LOCK DE DEADLINE ============
ALTER TABLE public.tournament_state
  ADD COLUMN IF NOT EXISTS picks_locked_at TIMESTAMPTZ NOT NULL
  DEFAULT '2026-06-11T15:00:00Z';  -- 10:00 COT

CREATE OR REPLACE FUNCTION public.enforce_picks_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lock TIMESTAMPTZ;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN
    RETURN NEW;
  END IF;
  SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
  IF v_lock IS NOT NULL AND now() >= v_lock THEN
    RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_deadline_trigger ON public.picks;
CREATE TRIGGER picks_deadline_trigger
BEFORE INSERT OR UPDATE ON public.picks
FOR EACH ROW EXECUTE FUNCTION public.enforce_picks_deadline();

-- ============ 3) AUDITORÍA ADMIN ============
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit TO authenticated;
GRANT ALL ON public.admin_audit TO service_role;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit" ON public.admin_audit;
CREATE POLICY "Admins read audit" ON public.admin_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ 4) VERIFICACIÓN PÚBLICA DE COMPROBANTES ============
-- Código del comprobante = primeros 12 chars de sha256(participant_id || updated_at)
CREATE OR REPLACE FUNCTION public.comprobante_code(_pid uuid, _updated_at timestamptz)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT substring(encode(digest(_pid::text || extract(epoch from _updated_at)::text, 'sha256'), 'hex') from 1 for 12);
$$;

CREATE OR REPLACE FUNCTION public.get_comprobante_public(_code text)
RETURNS TABLE(
  participant_id uuid,
  nombre text,
  estado_pago text,
  updated_at timestamptz,
  puntos_total integer,
  codigo text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pa.id, pa.nombre, pa.estado_pago, pk.updated_at,
    COALESCE(pk.puntos_total, 0),
    public.comprobante_code(pa.id, pk.updated_at)
  FROM public.participants pa
  JOIN public.picks pk ON pk.participant_id = pa.id
  WHERE public.comprobante_code(pa.id, pk.updated_at) = _code
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_comprobante_public(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comprobante_code(uuid, timestamptz) TO anon, authenticated, service_role;

-- ============ 5) Habilitar extensión pgcrypto si no existe (para digest) ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 20260608205911_40b4a96f-9ea9-41ab-8eab-5f7858d79484.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.comprobante_code(_pid uuid, _updated_at timestamptz)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT substring(encode(digest(_pid::text || extract(epoch from _updated_at)::text, 'sha256'), 'hex') from 1 for 12);
$$;

-- ============================================================
-- 20260608211000_revoke_definer_execute.sql
-- ============================================================
-- Lock down SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated
-- for internal helpers and triggers. Keep public-facing RPCs callable.

-- Internal helpers / triggers: nobody should call via PostgREST
REVOKE EXECUTE ON FUNCTION public.calc_pick_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.picks_recalc_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_picks_deadline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comprobante_code(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Admin-only RPCs: only authenticated may call (function checks has_role internally),
-- never anon.
REVOKE EXECUTE ON FUNCTION public.recalc_all_picks() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_polla_demo() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_polla_demo() FROM PUBLIC, anon;

-- has_role is used inside RLS policies; authenticated needs it, anon doesn't
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

-- Public RPCs (keep accessible)
GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_comprobante_public(text) TO anon, authenticated;

-- ============================================================
-- 20260608211245_43544c35-241a-4c1d-9958-5d377c60af68.sql
-- ============================================================
ALTER TABLE public.picks
  ADD COLUMN IF NOT EXISTS aciertos_5 int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aciertos_3 int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aciertos_2 int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.calc_pick_points(_pick_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s record; p record; k text; gobj jsonb;
  pos1_o text; pos2_o text; pos1_p text; pos2_p text;
  pts_g int := 0; pts_m int := 0; pts_e int := 0;
  c5 int := 0; c3 int := 0; c2 int := 0;
  match_o jsonb; match_p jsonb;
  oh int; oa int; ph int; pa int;
  sign_o int; sign_p int;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.picks WHERE participant_id = _pick_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
    gobj := s.groups->k;
    pos1_o := gobj->>'pos1'; pos2_o := gobj->>'pos2';
    pos1_p := (p.groups->k)->>'pos1'; pos2_p := (p.groups->k)->>'pos2';
    IF pos1_o IS NULL OR pos2_o IS NULL OR pos1_p IS NULL OR pos2_p IS NULL THEN CONTINUE; END IF;
    IF pos1_p = pos1_o AND pos2_p = pos2_o THEN
      pts_g := pts_g + 5; c5 := c5 + 1;
    ELSIF pos1_p = pos2_o AND pos2_p = pos1_o THEN
      pts_g := pts_g + 3; c3 := c3 + 1;
    ELSIF pos1_p = pos1_o OR pos1_p = pos2_o OR pos2_p = pos1_o OR pos2_p = pos2_o THEN
      pts_g := pts_g + 1;
    END IF;
  END LOOP;

  FOR match_o IN SELECT jsonb_array_elements(s.group_k_matches) LOOP
    oh := NULLIF(match_o->>'gh','')::int;
    oa := NULLIF(match_o->>'ga','')::int;
    IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
    match_p := p.group_k_matches -> (match_o->>'id');
    IF match_p IS NULL THEN CONTINUE; END IF;
    ph := NULLIF(match_p->>'gh','')::int;
    pa := NULLIF(match_p->>'ga','')::int;
    IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
    sign_o := sign(oh - oa); sign_p := sign(ph - pa);
    IF ph = oh AND pa = oa THEN
      pts_m := pts_m + 5; c5 := c5 + 1;
    ELSIF sign_o <> 0 AND sign_p = sign_o THEN
      IF ph = oh OR pa = oa THEN
        pts_m := pts_m + 3; c3 := c3 + 1;
      ELSE
        pts_m := pts_m + 2; c2 := c2 + 1;
      END IF;
    ELSIF sign_o = 0 AND sign_p = 0 THEN
      pts_m := pts_m + 1;
    ELSIF ph = oh OR pa = oa THEN
      pts_m := pts_m + 1;
    END IF;
  END LOOP;

  IF s.goleador_id IS NOT NULL AND p.goleador_id = s.goleador_id THEN pts_e := pts_e + 10; END IF;
  IF s.arquero_id IS NOT NULL AND p.arquero_id = s.arquero_id THEN pts_e := pts_e + 10; END IF;

  UPDATE public.picks SET
    puntos_grupos = pts_g, puntos_partidos = pts_m, puntos_especiales = pts_e,
    aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _pick_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.calc_pick_points(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.get_polla_leaderboard();
CREATE FUNCTION public.get_polla_leaderboard()
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
  WHERE pa.estado_pago = 'aprobado';
$function$;

GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT participant_id FROM public.picks LOOP
    PERFORM public.calc_pick_points(r.participant_id);
  END LOOP;
END $$;
-- ============================================================
-- 20260608220000_remove_demo_data.sql
-- ============================================================
-- Limpieza de datos de prueba (demo) para dejar la polla lista para producción.
--
-- Qué hace:
--   1) Borra los 6 usuarios demoN@gilipolla.co. El FK participants.user_id ->
--      auth.users (ON DELETE CASCADE) elimina sus participants y, a su vez, sus picks.
--   2) Elimina cualquier participant [DEMO] huérfano que hubiera quedado sin user_id.
--   3) Quita las funciones seed_polla_demo() / reset_polla_demo(): ya no se usan en
--      la app (se retiró el tab "Demo" del admin) y así no se puede re-sembrar.
--
-- Qué NO toca:
--   - El admin sembrado admin@gilipolla.co (no es demo).
--   - Ningún participante ni planilla reales.
--
-- Idempotente: si ya no existen datos demo, no borra nada.

BEGIN;

-- 1) Usuarios demo (cascade → participants + picks)
DELETE FROM auth.users
WHERE email LIKE 'demo%@gilipolla.co';

-- 2) Participants [DEMO] huérfanos (por si quedaron sin user_id)
DELETE FROM public.participants
WHERE nombre LIKE '[DEMO]%';

-- 3) Retirar funciones de datos de prueba
DROP FUNCTION IF EXISTS public.seed_polla_demo();
DROP FUNCTION IF EXISTS public.reset_polla_demo();

COMMIT;

-- ============================================================
-- 20260608221000_official_data_resolved.sql
-- ============================================================
-- Datos OFICIALES Mundial 2026 con repechajes ya resueltos (a junio 2026).
--
-- Resuelve los 6 slots de repechaje del sorteo (5 dic 2025) a sus ganadores reales
-- (UEFA play-offs y repechaje intercontinental, marzo 2026):
--   Grupo A · UEFA-D  -> Chequia (CZE)
--   Grupo B · UEFA-A  -> Bosnia y Herzegovina (BIH)
--   Grupo D · UEFA-C  -> Turquía (TUR)
--   Grupo F · UEFA-B  -> Suecia (SWE)
--   Grupo I · FIFA-2  -> Irak (IRQ)
--   Grupo K · FIFA-1  -> RD Congo (COD)
--
-- Y corrige los partidos del Grupo K (Colombia) con sedes y local/visitante oficiales:
--   J1 17 jun: Portugal–RD Congo (NRG Stadium, Houston) · Uzbekistán–Colombia (Azteca, CDMX)
--   J2 23 jun: Portugal–Uzbekistán (NRG Stadium, Houston) · Colombia–RD Congo (Akron, Guadalajara)
--   J3 27 jun: Colombia–Portugal (Hard Rock, Miami) · RD Congo–Uzbekistán (Mercedes-Benz, Atlanta)
--
-- Seguro de re-ejecutar: hace UPDATE del singleton tournament_state (id=1).
-- Las picks aún no referencian estos equipos (datos demo ya limpiados).

UPDATE public.tournament_state SET
  groups = $JSON$
  {
    "A": {"teams":[
      {"id":"MEX","nombre":"México"},
      {"id":"RSA","nombre":"Sudáfrica"},
      {"id":"KOR","nombre":"Corea del Sur"},
      {"id":"CZE","nombre":"Chequia"}
    ],"pos1":null,"pos2":null},
    "B": {"teams":[
      {"id":"CAN","nombre":"Canadá"},
      {"id":"BIH","nombre":"Bosnia y Herzegovina"},
      {"id":"QAT","nombre":"Catar"},
      {"id":"SUI","nombre":"Suiza"}
    ],"pos1":null,"pos2":null},
    "C": {"teams":[
      {"id":"BRA","nombre":"Brasil"},
      {"id":"MAR","nombre":"Marruecos"},
      {"id":"HAI","nombre":"Haití"},
      {"id":"SCO","nombre":"Escocia"}
    ],"pos1":null,"pos2":null},
    "D": {"teams":[
      {"id":"USA","nombre":"Estados Unidos"},
      {"id":"PAR","nombre":"Paraguay"},
      {"id":"AUS","nombre":"Australia"},
      {"id":"TUR","nombre":"Turquía"}
    ],"pos1":null,"pos2":null},
    "E": {"teams":[
      {"id":"GER","nombre":"Alemania"},
      {"id":"CUW","nombre":"Curazao"},
      {"id":"CIV","nombre":"Costa de Marfil"},
      {"id":"ECU","nombre":"Ecuador"}
    ],"pos1":null,"pos2":null},
    "F": {"teams":[
      {"id":"NED","nombre":"Países Bajos"},
      {"id":"JPN","nombre":"Japón"},
      {"id":"SWE","nombre":"Suecia"},
      {"id":"TUN","nombre":"Túnez"}
    ],"pos1":null,"pos2":null},
    "G": {"teams":[
      {"id":"BEL","nombre":"Bélgica"},
      {"id":"EGY","nombre":"Egipto"},
      {"id":"IRN","nombre":"Irán"},
      {"id":"NZL","nombre":"Nueva Zelanda"}
    ],"pos1":null,"pos2":null},
    "H": {"teams":[
      {"id":"ESP","nombre":"España"},
      {"id":"CPV","nombre":"Cabo Verde"},
      {"id":"KSA","nombre":"Arabia Saudita"},
      {"id":"URU","nombre":"Uruguay"}
    ],"pos1":null,"pos2":null},
    "I": {"teams":[
      {"id":"FRA","nombre":"Francia"},
      {"id":"SEN","nombre":"Senegal"},
      {"id":"IRQ","nombre":"Irak"},
      {"id":"NOR","nombre":"Noruega"}
    ],"pos1":null,"pos2":null},
    "J": {"teams":[
      {"id":"ARG","nombre":"Argentina"},
      {"id":"ALG","nombre":"Argelia"},
      {"id":"AUT","nombre":"Austria"},
      {"id":"JOR","nombre":"Jordania"}
    ],"pos1":null,"pos2":null},
    "K": {"teams":[
      {"id":"POR","nombre":"Portugal"},
      {"id":"COD","nombre":"RD Congo"},
      {"id":"UZB","nombre":"Uzbekistán"},
      {"id":"COL","nombre":"Colombia"}
    ],"pos1":null,"pos2":null},
    "L": {"teams":[
      {"id":"ENG","nombre":"Inglaterra"},
      {"id":"CRO","nombre":"Croacia"},
      {"id":"GHA","nombre":"Ghana"},
      {"id":"PAN","nombre":"Panamá"}
    ],"pos1":null,"pos2":null}
  }
  $JSON$::jsonb,
  group_k_matches = $JSON$
  [
    {"id":"1","fecha":"2026-06-17T21:00:00-05:00","local":"UZB","visitante":"COL","sede":"Estadio Azteca · Ciudad de México","gh":null,"ga":null},
    {"id":"2","fecha":"2026-06-17T12:00:00-05:00","local":"POR","visitante":"COD","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"3","fecha":"2026-06-23T21:00:00-05:00","local":"COL","visitante":"COD","sede":"Estadio Akron · Guadalajara","gh":null,"ga":null},
    {"id":"4","fecha":"2026-06-23T12:00:00-05:00","local":"POR","visitante":"UZB","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"5","fecha":"2026-06-27T18:30:00-05:00","local":"COL","visitante":"POR","sede":"Hard Rock Stadium · Miami","gh":null,"ga":null},
    {"id":"6","fecha":"2026-06-27T18:30:00-05:00","local":"COD","visitante":"UZB","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null}
  ]
  $JSON$::jsonb,
  updated_at = now()
WHERE id = 1;

-- ============================================================
-- 20260609013359_73ae54af-e1ff-4147-bb4b-ae9cd19be27c.sql
-- ============================================================
-- === 211000: revoke execute on internal definer functions ===
REVOKE EXECUTE ON FUNCTION public.calc_pick_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.picks_recalc_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_picks_deadline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comprobante_code(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_all_picks() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_comprobante_public(text) TO anon, authenticated;

-- === 220000: remove demo data + demo seed functions ===
DELETE FROM auth.users WHERE email LIKE 'demo%@gilipolla.co';
DELETE FROM public.participants WHERE nombre LIKE '[DEMO]%';
DROP FUNCTION IF EXISTS public.seed_polla_demo();
DROP FUNCTION IF EXISTS public.reset_polla_demo();

-- === 221000: official Mundial 2026 data (playoffs resolved + Group K matches) ===
UPDATE public.tournament_state SET
  groups = $JSON$
  {
    "A": {"teams":[
      {"id":"MEX","nombre":"México"},
      {"id":"RSA","nombre":"Sudáfrica"},
      {"id":"KOR","nombre":"Corea del Sur"},
      {"id":"CZE","nombre":"Chequia"}
    ],"pos1":null,"pos2":null},
    "B": {"teams":[
      {"id":"CAN","nombre":"Canadá"},
      {"id":"BIH","nombre":"Bosnia y Herzegovina"},
      {"id":"QAT","nombre":"Catar"},
      {"id":"SUI","nombre":"Suiza"}
    ],"pos1":null,"pos2":null},
    "C": {"teams":[
      {"id":"BRA","nombre":"Brasil"},
      {"id":"MAR","nombre":"Marruecos"},
      {"id":"HAI","nombre":"Haití"},
      {"id":"SCO","nombre":"Escocia"}
    ],"pos1":null,"pos2":null},
    "D": {"teams":[
      {"id":"USA","nombre":"Estados Unidos"},
      {"id":"PAR","nombre":"Paraguay"},
      {"id":"AUS","nombre":"Australia"},
      {"id":"TUR","nombre":"Turquía"}
    ],"pos1":null,"pos2":null},
    "E": {"teams":[
      {"id":"GER","nombre":"Alemania"},
      {"id":"CUW","nombre":"Curazao"},
      {"id":"CIV","nombre":"Costa de Marfil"},
      {"id":"ECU","nombre":"Ecuador"}
    ],"pos1":null,"pos2":null},
    "F": {"teams":[
      {"id":"NED","nombre":"Países Bajos"},
      {"id":"JPN","nombre":"Japón"},
      {"id":"SWE","nombre":"Suecia"},
      {"id":"TUN","nombre":"Túnez"}
    ],"pos1":null,"pos2":null},
    "G": {"teams":[
      {"id":"BEL","nombre":"Bélgica"},
      {"id":"EGY","nombre":"Egipto"},
      {"id":"IRN","nombre":"Irán"},
      {"id":"NZL","nombre":"Nueva Zelanda"}
    ],"pos1":null,"pos2":null},
    "H": {"teams":[
      {"id":"ESP","nombre":"España"},
      {"id":"CPV","nombre":"Cabo Verde"},
      {"id":"KSA","nombre":"Arabia Saudita"},
      {"id":"URU","nombre":"Uruguay"}
    ],"pos1":null,"pos2":null},
    "I": {"teams":[
      {"id":"FRA","nombre":"Francia"},
      {"id":"SEN","nombre":"Senegal"},
      {"id":"IRQ","nombre":"Irak"},
      {"id":"NOR","nombre":"Noruega"}
    ],"pos1":null,"pos2":null},
    "J": {"teams":[
      {"id":"ARG","nombre":"Argentina"},
      {"id":"ALG","nombre":"Argelia"},
      {"id":"AUT","nombre":"Austria"},
      {"id":"JOR","nombre":"Jordania"}
    ],"pos1":null,"pos2":null},
    "K": {"teams":[
      {"id":"POR","nombre":"Portugal"},
      {"id":"COD","nombre":"RD Congo"},
      {"id":"UZB","nombre":"Uzbekistán"},
      {"id":"COL","nombre":"Colombia"}
    ],"pos1":null,"pos2":null},
    "L": {"teams":[
      {"id":"ENG","nombre":"Inglaterra"},
      {"id":"CRO","nombre":"Croacia"},
      {"id":"GHA","nombre":"Ghana"},
      {"id":"PAN","nombre":"Panamá"}
    ],"pos1":null,"pos2":null}
  }
  $JSON$::jsonb,
  group_k_matches = $JSON$
  [
    {"id":"1","fecha":"2026-06-17T21:00:00-05:00","local":"UZB","visitante":"COL","sede":"Estadio Azteca · Ciudad de México","gh":null,"ga":null},
    {"id":"2","fecha":"2026-06-17T12:00:00-05:00","local":"POR","visitante":"COD","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"3","fecha":"2026-06-23T21:00:00-05:00","local":"COL","visitante":"COD","sede":"Estadio Akron · Guadalajara","gh":null,"ga":null},
    {"id":"4","fecha":"2026-06-23T12:00:00-05:00","local":"POR","visitante":"UZB","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"5","fecha":"2026-06-27T18:30:00-05:00","local":"COL","visitante":"POR","sede":"Hard Rock Stadium · Miami","gh":null,"ga":null},
    {"id":"6","fecha":"2026-06-27T18:30:00-05:00","local":"COD","visitante":"UZB","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null}
  ]
  $JSON$::jsonb,
  updated_at = now()
WHERE id = 1;
-- ============================================================
-- 20260609021225_87af9139-f3b7-44eb-99cc-5632c99e9ad8.sql
-- ============================================================

-- RLS for backups bucket: only admins can list/read; writes via service_role only
CREATE POLICY "admins read backups"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete backups"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 20260609031056_bf8598df-76bf-42b4-bc75-e398525392b9.sql
-- ============================================================

-- 1. Columnas para fases futuras y partidos extra (sin tocar puntos ya calculados)
ALTER TABLE public.tournament_state
  ADD COLUMN IF NOT EXISTS phases jsonb NOT NULL DEFAULT
    '{"grupos":true,"octavos":false,"cuartos":false,"semis":false,"final":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_matches jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Helper: ¿este partido está bloqueado? (≤24h para que empiece)
CREATE OR REPLACE FUNCTION public.is_match_locked(_match_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_state ts,
         jsonb_array_elements(ts.group_k_matches || ts.extra_matches) AS m
    WHERE ts.id = 1
      AND m->>'id' = _match_id
      AND (m->>'fecha')::timestamptz <= now() + interval '24 hours'
  );
$$;

-- 3. Trigger reforzado: bloqueo global + bloqueo 24h por partido (sin bypass admin)
CREATE OR REPLACE FUNCTION public.enforce_picks_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock TIMESTAMPTZ;
  v_key  text;
  v_old  jsonb;
  v_new  jsonb;
BEGIN
  -- Bloqueo global (deadline general): admin SÍ tiene bypass aquí
  IF NOT public.has_role(auth.uid(),'admin') THEN
    SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
    IF v_lock IS NOT NULL AND now() >= v_lock THEN
      RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
    END IF;
  END IF;

  -- Bloqueo por partido (24h): aplica a TODOS, incluido admin
  IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
    FOR v_key IN
      SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches, '{}'::jsonb))
    LOOP
      v_new := NEW.group_k_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.group_k_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- (Asegurar que el trigger exista — idempotente)
DROP TRIGGER IF EXISTS picks_enforce_deadline ON public.picks;
CREATE TRIGGER picks_enforce_deadline
  BEFORE INSERT OR UPDATE ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_picks_deadline();

-- 4. Realtime para que el frontend reciba resultados y leaderboard al instante
ALTER TABLE public.tournament_state REPLICA IDENTITY FULL;
ALTER TABLE public.picks REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournament_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_state';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'picks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.picks';
  END IF;
END $$;

-- ============================================================
-- 20260609032317_1dbddfb4-b4b0-4b1b-a867-be37c0b73304.sql
-- ============================================================
-- 1) Drop duplicate deadline trigger (kept picks_enforce_deadline)
DROP TRIGGER IF EXISTS picks_deadline_trigger ON public.picks;

-- 2) Harden is_match_locked against NULL extra_matches
CREATE OR REPLACE FUNCTION public.is_match_locked(_match_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_state ts,
         jsonb_array_elements(
           COALESCE(ts.group_k_matches, '[]'::jsonb)
           || COALESCE(ts.extra_matches, '[]'::jsonb)
         ) AS m
    WHERE ts.id = 1
      AND m->>'id' = _match_id
      AND (m->>'fecha')::timestamptz <= now() + interval '24 hours'
  );
$function$;
-- ============================================================
-- 20260609032801_395bce1b-c0bb-4589-9d10-9efe1b0db6d9.sql
-- ============================================================
-- Remove picks from the realtime publication: with realtime.messages RLS not configured,
-- subscribing to picks would let any authenticated user see every other user's picks.
-- Leaderboard updates continue to flow because tournament_state changes still publish.
ALTER PUBLICATION supabase_realtime DROP TABLE public.picks;
-- ============================================================
-- 20260609034340_9f7bebc5-43a1-4b55-bdb9-9aa75b331379.sql
-- ============================================================
-- Revoke EXECUTE from internal SECURITY DEFINER functions for anon/authenticated/public.
-- Triggers and SQL-internal callers do NOT require EXECUTE grants, so this is safe.

DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'public.has_role(uuid, app_role)',
    'public.is_match_locked(text)',
    'public.calc_pick_points(uuid)',
    'public.comprobante_code(uuid, timestamptz)',
    'public.enforce_picks_deadline()',
    'public.handle_new_user_role()',
    'public.picks_recalc_trigger()',
    'public.update_updated_at_column()'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- Public-facing RPCs: keep callable by anon + authenticated.
REVOKE ALL ON FUNCTION public.get_polla_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_comprobante_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_comprobante_public(text) TO anon, authenticated, service_role;

-- Admin-only RPC (function itself validates has_role(auth.uid(),'admin')).
REVOKE ALL ON FUNCTION public.recalc_all_picks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalc_all_picks() FROM anon;
GRANT EXECUTE ON FUNCTION public.recalc_all_picks() TO authenticated, service_role;
-- ============================================================
-- 20260609135809_83292f7d-3c3b-4ed4-bb6f-0bcae434c8f4.sql
-- ============================================================
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
-- ============================================================
-- 20260609140006_4ca0461a-b3ae-4b80-bfea-798302aeb1a3.sql
-- ============================================================
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
-- ============================================================
-- 20260609195632_e14ca3e2-410c-4ff3-bac8-244e59a725d0.sql
-- ============================================================

-- 1. Extender picks con extra_matches
ALTER TABLE public.picks
  ADD COLUMN IF NOT EXISTS extra_matches jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Extender tournament_state con visibility
ALTER TABLE public.tournament_state
  ADD COLUMN IF NOT EXISTS visibility jsonb NOT NULL DEFAULT
    jsonb_build_object(
      'grupos', true, 'octavos', true, 'cuartos', true,
      'semis', true, 'tercero', true, 'final', true,
      'goleador', true, 'arquero', true, 'historico', true
    );

-- 3. Tabla pick_history
CREATE TABLE IF NOT EXISTS public.pick_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  match_id text NOT NULL,
  fase text NOT NULL,
  gh_anterior int,
  ga_anterior int,
  gh_nuevo int,
  ga_nuevo int,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pick_history_participant_idx
  ON public.pick_history(participant_id, changed_at DESC);

GRANT SELECT ON public.pick_history TO authenticated;
GRANT ALL ON public.pick_history TO service_role;

ALTER TABLE public.pick_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participant reads own history"
  ON public.pick_history FOR SELECT
  TO authenticated
  USING (
    participant_id IN (
      SELECT id FROM public.participants WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- 4. Trigger: registrar cambios de marcador
CREATE OR REPLACE FUNCTION public.log_pick_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  v_old jsonb; v_new jsonb;
  fase_lookup text;
BEGIN
  -- group_k_matches (fase grupos)
  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches, '{}'::jsonb)) LOOP
    v_new := NEW.group_k_matches -> k;
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.group_k_matches -> k ELSE NULL END;
    IF v_new IS DISTINCT FROM v_old THEN
      INSERT INTO public.pick_history(participant_id, match_id, fase,
        gh_anterior, ga_anterior, gh_nuevo, ga_nuevo, changed_by)
      VALUES (NEW.participant_id, k, 'grupos',
        NULLIF(v_old->>'gh','')::int, NULLIF(v_old->>'ga','')::int,
        NULLIF(v_new->>'gh','')::int, NULLIF(v_new->>'ga','')::int,
        auth.uid());
    END IF;
  END LOOP;

  -- extra_matches (fases eliminatorias)
  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches, '{}'::jsonb)) LOOP
    v_new := NEW.extra_matches -> k;
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.extra_matches -> k ELSE NULL END;
    IF v_new IS DISTINCT FROM v_old THEN
      SELECT m->>'fase' INTO fase_lookup
      FROM public.tournament_state ts,
           jsonb_array_elements(COALESCE(ts.extra_matches, '[]'::jsonb)) m
      WHERE ts.id = 1 AND m->>'id' = k
      LIMIT 1;
      INSERT INTO public.pick_history(participant_id, match_id, fase,
        gh_anterior, ga_anterior, gh_nuevo, ga_nuevo, changed_by)
      VALUES (NEW.participant_id, k, COALESCE(fase_lookup, 'extra'),
        NULLIF(v_old->>'gh','')::int, NULLIF(v_old->>'ga','')::int,
        NULLIF(v_new->>'gh','')::int, NULLIF(v_new->>'ga','')::int,
        auth.uid());
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_log_history ON public.picks;
CREATE TRIGGER picks_log_history
  AFTER INSERT OR UPDATE ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.log_pick_history();

-- 5. Extender enforce_picks_deadline para extra_matches
CREATE OR REPLACE FUNCTION public.enforce_picks_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock TIMESTAMPTZ;
  v_key  text;
  v_old  jsonb;
  v_new  jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
    IF v_lock IS NOT NULL AND now() >= v_lock THEN
      RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches, '{}'::jsonb)) LOOP
      v_new := NEW.group_k_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.group_k_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;

    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches, '{}'::jsonb)) LOOP
      v_new := NEW.extra_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.extra_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Extender calc_pick_points para sumar puntos de extra_matches
CREATE OR REPLACE FUNCTION public.calc_pick_points(_pick_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record; p record; k text; gobj jsonb;
  pos1_o text; pos2_o text; pos1_p text; pos2_p text;
  pts_g int := 0; pts_m int := 0; pts_e int := 0;
  c5 int := 0; c3 int := 0; c2 int := 0;
  match_o jsonb; match_p jsonb;
  oh int; oa int; ph int; pa int;
  sign_o int; sign_p int;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.picks WHERE participant_id = _pick_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  -- Grupos: posiciones
  FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
    gobj := s.groups->k;
    pos1_o := gobj->>'pos1'; pos2_o := gobj->>'pos2';
    pos1_p := (p.groups->k)->>'pos1'; pos2_p := (p.groups->k)->>'pos2';
    IF pos1_o IS NULL OR pos2_o IS NULL OR pos1_p IS NULL OR pos2_p IS NULL THEN CONTINUE; END IF;
    IF pos1_p = pos1_o AND pos2_p = pos2_o THEN
      pts_g := pts_g + 5; c5 := c5 + 1;
    ELSIF pos1_p = pos2_o AND pos2_p = pos1_o THEN
      pts_g := pts_g + 3; c3 := c3 + 1;
    ELSIF pos1_p = pos1_o OR pos1_p = pos2_o OR pos2_p = pos1_o OR pos2_p = pos2_o THEN
      pts_g := pts_g + 1;
    END IF;
  END LOOP;

  -- Partidos de fase de grupos
  FOR match_o IN SELECT jsonb_array_elements(s.group_k_matches) LOOP
    oh := NULLIF(match_o->>'gh','')::int;
    oa := NULLIF(match_o->>'ga','')::int;
    IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
    match_p := p.group_k_matches -> (match_o->>'id');
    IF match_p IS NULL THEN CONTINUE; END IF;
    ph := NULLIF(match_p->>'gh','')::int;
    pa := NULLIF(match_p->>'ga','')::int;
    IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
    sign_o := sign(oh - oa); sign_p := sign(ph - pa);
    IF ph = oh AND pa = oa THEN
      pts_m := pts_m + 5; c5 := c5 + 1;
    ELSIF sign_o <> 0 AND sign_p = sign_o THEN
      IF ph = oh OR pa = oa THEN
        pts_m := pts_m + 3; c3 := c3 + 1;
      ELSE
        pts_m := pts_m + 2; c2 := c2 + 1;
      END IF;
    ELSIF sign_o = 0 AND sign_p = 0 THEN
      pts_m := pts_m + 1;
    ELSIF ph = oh OR pa = oa THEN
      pts_m := pts_m + 1;
    END IF;
  END LOOP;

  -- Partidos extra (eliminatorias)
  IF s.extra_matches IS NOT NULL THEN
    FOR match_o IN SELECT jsonb_array_elements(s.extra_matches) LOOP
      oh := NULLIF(match_o->>'gh','')::int;
      oa := NULLIF(match_o->>'ga','')::int;
      IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
      match_p := p.extra_matches -> (match_o->>'id');
      IF match_p IS NULL THEN CONTINUE; END IF;
      ph := NULLIF(match_p->>'gh','')::int;
      pa := NULLIF(match_p->>'ga','')::int;
      IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
      sign_o := sign(oh - oa); sign_p := sign(ph - pa);
      IF ph = oh AND pa = oa THEN
        pts_m := pts_m + 5; c5 := c5 + 1;
      ELSIF sign_o <> 0 AND sign_p = sign_o THEN
        IF ph = oh OR pa = oa THEN
          pts_m := pts_m + 3; c3 := c3 + 1;
        ELSE
          pts_m := pts_m + 2; c2 := c2 + 1;
        END IF;
      ELSIF sign_o = 0 AND sign_p = 0 THEN
        pts_m := pts_m + 1;
      ELSIF ph = oh OR pa = oa THEN
        pts_m := pts_m + 1;
      END IF;
    END LOOP;
  END IF;

  -- Especiales
  IF s.goleador_id IS NOT NULL AND p.goleador_id = s.goleador_id THEN pts_e := pts_e + 10; END IF;
  IF s.arquero_id IS NOT NULL AND p.arquero_id = s.arquero_id THEN pts_e := pts_e + 10; END IF;

  UPDATE public.picks SET
    puntos_grupos = pts_g, puntos_partidos = pts_m, puntos_especiales = pts_e,
    aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _pick_id;
END;
$$;

-- ============================================================
-- 20260609201130_93033135-6eb8-42c0-bb36-6d5548421eb3.sql
-- ============================================================
ALTER TABLE public.picks REPLICA IDENTITY FULL;
ALTER TABLE public.pick_history REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.picks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pick_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
-- ============================================================
-- 20260609231310_d0f48ee2-cbc3-43e1-a874-88e772074a86.sql
-- ============================================================
UPDATE public.tournament_state
SET extra_matches = (
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              extra_matches::text,
              'Winner Match ([0-9]+)', 'Ganador Partido \1', 'g'
            ),
            'Loser Match ([0-9]+)', 'Perdedor Partido \1', 'g'
          ),
          'Runner-up ', 'Segundo ', 'g'
        ),
        'Best 3rd', 'Mejor 3°', 'g'
      ),
      'Winner ', 'Ganador ', 'g'
    ),
    'Play-?off', 'Repechaje', 'g'
  )
)::jsonb;
-- ============================================================
-- 20260610030308_3d641841-f761-4fd3-82e8-1340e06d594f.sql
-- ============================================================

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

-- ============================================================
-- 20260610150000_recalc_trigger_extra_matches.sql
-- ============================================================
-- El trigger picks_recalc_after_change disparaba el recálculo de puntos solo cuando
-- cambiaban groups/group_k_matches/goleador_id/arquero_id, omitiendo extra_matches.
-- Si un participante editaba únicamente sus predicciones de eliminatorias sin tocar
-- otro campo, sus puntos no se recalculaban. Se incluye extra_matches en el UPDATE OF.
-- (El flujo del admin no se ve afectado: usa recalc_all_picks() sobre todos los picks.)
DROP TRIGGER IF EXISTS picks_recalc_after_change ON public.picks;
CREATE TRIGGER picks_recalc_after_change
  AFTER INSERT OR UPDATE OF groups, group_k_matches, extra_matches, goleador_id, arquero_id
  ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.picks_recalc_trigger();

-- ============================================================
-- 20260610160000_validate_scores_immutability.sql
-- ============================================================
-- Endurecimiento del flujo de la polla (garantías en el servidor, no solo en el cliente):
--  1) Marcadores de un solo dígito (0–9) y con AMBOS campos llenos (parcial = inválido).
--  2) Grupos sin 1º y 2º repetidos.
--  3) Inmutabilidad: para no-admin, lo ya guardado no se puede cambiar ni borrar.
--  4) recalc_all_picks() se bloquea si los resultados OFICIALES están incompletos/ inválidos.
-- Nota: en `picks` los marcadores son objetos jsonb por id; en `tournament_state` son arrays.

-- Helper: ¿un objeto de marcador {gh,ga} es inválido para la polla?
--   vacío (ambos null) = válido (no jugado / sin pronosticar)
--   parcial (uno solo) = inválido · fuera de 0–9 = inválido · no numérico = inválido
CREATE OR REPLACE FUNCTION public._gp_score_invalid(j jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE gh int; ga int;
BEGIN
  IF j IS NULL THEN RETURN false; END IF;
  gh := NULLIF(j->>'gh','')::int;
  ga := NULLIF(j->>'ga','')::int;
  IF gh IS NULL AND ga IS NULL THEN RETURN false; END IF;     -- vacío: permitido
  IF gh IS NULL OR ga IS NULL THEN RETURN true; END IF;        -- parcial: inválido
  IF gh < 0 OR gh > 9 OR ga < 0 OR ga > 9 THEN RETURN true; END IF;
  RETURN false;
EXCEPTION WHEN others THEN
  RETURN true;  -- cualquier valor no parseable es inválido
END; $$;

-- Trigger de validación de picks (BEFORE INSERT/UPDATE).
CREATE OR REPLACE FUNCTION public.picks_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text; v jsonb; oldv jsonb;
  is_admin boolean;
BEGIN
  is_admin := public.has_role(auth.uid(),'admin');

  -- 1) Marcadores válidos (un dígito 0–9, ambos campos o ninguno). Aplica a todos.
  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches,'{}'::jsonb)) LOOP
    IF public._gp_score_invalid(NEW.group_k_matches->k) THEN
      RAISE EXCEPTION 'Marcador inválido en el partido %: usa un solo dígito (0–9) en ambos campos.', k;
    END IF;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches,'{}'::jsonb)) LOOP
    IF public._gp_score_invalid(NEW.extra_matches->k) THEN
      RAISE EXCEPTION 'Marcador inválido en el partido %: usa un solo dígito (0–9) en ambos campos.', k;
    END IF;
  END LOOP;

  -- 2) Grupos sin 1º y 2º repetidos. Aplica a todos.
  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.groups,'{}'::jsonb)) LOOP
    v := NEW.groups->k;
    IF (v->>'pos1') IS NOT NULL AND (v->>'pos2') IS NOT NULL AND (v->>'pos1') = (v->>'pos2') THEN
      RAISE EXCEPTION 'El grupo % tiene el mismo equipo en 1º y 2º.', k;
    END IF;
  END LOOP;

  -- 3) Inmutabilidad para no-admin: lo ya guardado no se puede cambiar ni borrar.
  IF NOT is_admin AND TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(COALESCE(OLD.groups,'{}'::jsonb)) LOOP
      oldv := OLD.groups->k; v := NEW.groups->k;
      IF (oldv->>'pos1') IS NOT NULL AND (v->>'pos1') IS DISTINCT FROM (oldv->>'pos1') THEN
        RAISE EXCEPTION 'El 1º del grupo % ya fue guardado y no se puede cambiar.', k;
      END IF;
      IF (oldv->>'pos2') IS NOT NULL AND (v->>'pos2') IS DISTINCT FROM (oldv->>'pos2') THEN
        RAISE EXCEPTION 'El 2º del grupo % ya fue guardado y no se puede cambiar.', k;
      END IF;
    END LOOP;

    FOR k IN SELECT jsonb_object_keys(COALESCE(OLD.group_k_matches,'{}'::jsonb)) LOOP
      oldv := OLD.group_k_matches->k; v := NEW.group_k_matches->k;
      IF (oldv->>'gh') IS NOT NULL AND (v->>'gh') IS DISTINCT FROM (oldv->>'gh') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
      IF (oldv->>'ga') IS NOT NULL AND (v->>'ga') IS DISTINCT FROM (oldv->>'ga') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
    END LOOP;

    FOR k IN SELECT jsonb_object_keys(COALESCE(OLD.extra_matches,'{}'::jsonb)) LOOP
      oldv := OLD.extra_matches->k; v := NEW.extra_matches->k;
      IF (oldv->>'gh') IS NOT NULL AND (v->>'gh') IS DISTINCT FROM (oldv->>'gh') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
      IF (oldv->>'ga') IS NOT NULL AND (v->>'ga') IS DISTINCT FROM (oldv->>'ga') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
    END LOOP;

    IF OLD.goleador_id IS NOT NULL AND btrim(OLD.goleador_id) <> ''
       AND NEW.goleador_id IS DISTINCT FROM OLD.goleador_id THEN
      RAISE EXCEPTION 'El goleador ya fue guardado y no se puede cambiar.';
    END IF;
    IF OLD.arquero_id IS NOT NULL AND btrim(OLD.arquero_id) <> ''
       AND NEW.arquero_id IS DISTINCT FROM OLD.arquero_id THEN
      RAISE EXCEPTION 'El arquero ya fue guardado y no se puede cambiar.';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.picks_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.picks_validate() TO service_role;
REVOKE ALL ON FUNCTION public._gp_score_invalid(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._gp_score_invalid(jsonb) TO service_role;

DROP TRIGGER IF EXISTS picks_validate_before ON public.picks;
CREATE TRIGGER picks_validate_before
  BEFORE INSERT OR UPDATE ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.picks_validate();

-- 4) recalc_all_picks(): no recalcular si los resultados oficiales son inválidos.
CREATE OR REPLACE FUNCTION public.recalc_all_picks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; n int := 0; s record; m jsonb; k text; gobj jsonb;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  IF FOUND THEN
    FOR m IN SELECT jsonb_array_elements(COALESCE(s.group_k_matches,'[]'::jsonb)) LOOP
      IF public._gp_score_invalid(m) THEN
        RAISE EXCEPTION 'Resultados oficiales inválidos: hay un marcador de más de un dígito o incompleto.';
      END IF;
    END LOOP;
    FOR m IN SELECT jsonb_array_elements(COALESCE(s.extra_matches,'[]'::jsonb)) LOOP
      IF public._gp_score_invalid(m) THEN
        RAISE EXCEPTION 'Resultados oficiales inválidos: hay un marcador de más de un dígito o incompleto.';
      END IF;
    END LOOP;
    FOR k IN SELECT jsonb_object_keys(COALESCE(s.groups,'{}'::jsonb)) LOOP
      gobj := s.groups->k;
      IF (gobj->>'pos1') IS NOT NULL AND (gobj->>'pos2') IS NOT NULL
         AND (gobj->>'pos1') = (gobj->>'pos2') THEN
        RAISE EXCEPTION 'Resultados oficiales inválidos: el grupo % tiene 1º y 2º repetidos.', k;
      END IF;
    END LOOP;
  END IF;

  FOR r IN SELECT participant_id FROM public.picks LOOP
    PERFORM public.calc_pick_points(r.participant_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

REVOKE ALL ON FUNCTION public.recalc_all_picks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_all_picks() TO authenticated, service_role;

-- ============================================================
-- 20260610170000_norm_especiales.sql
-- ============================================================
-- Normalización del texto de especiales (goleador/arquero).
-- El puntaje comparaba texto EXACTO con el oficial: "Kylian Mbappé (Francia)" no
-- igualaba "kylian mbappe (francia)". Ahora la comparación tolera mayúsculas,
-- espacios extra y acentos. El texto guardado no cambia; solo la comparación.

-- Normaliza: minúsculas, sin acentos (sin depender de la extensión unaccent),
-- espacios internos colapsados y sin espacios en los bordes. NULL → NULL.
CREATE OR REPLACE FUNCTION public.norm_especial(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
    regexp_replace(
      translate(
        lower(t),
        'áéíóúàèìòùäëïöüâêîôûãõñç',
        'aeiouaeiouaeiouaeiouaonc'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.norm_especial(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.norm_especial(text) TO service_role;

-- calc_pick_points: igual que antes, pero los especiales comparan normalizado.
CREATE OR REPLACE FUNCTION public.calc_pick_points(_pick_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record; p record; k text; gobj jsonb;
  pos1_o text; pos2_o text; pos1_p text; pos2_p text;
  pts_g int := 0; pts_m int := 0; pts_e int := 0;
  c5 int := 0; c3 int := 0; c2 int := 0;
  match_o jsonb; match_p jsonb;
  oh int; oa int; ph int; pa int;
  sign_o int; sign_p int;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.picks WHERE participant_id = _pick_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  -- Grupos: posiciones
  FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
    gobj := s.groups->k;
    pos1_o := gobj->>'pos1'; pos2_o := gobj->>'pos2';
    pos1_p := (p.groups->k)->>'pos1'; pos2_p := (p.groups->k)->>'pos2';
    IF pos1_o IS NULL OR pos2_o IS NULL OR pos1_p IS NULL OR pos2_p IS NULL THEN CONTINUE; END IF;
    IF pos1_p = pos1_o AND pos2_p = pos2_o THEN
      pts_g := pts_g + 5; c5 := c5 + 1;
    ELSIF pos1_p = pos2_o AND pos2_p = pos1_o THEN
      pts_g := pts_g + 3; c3 := c3 + 1;
    ELSIF pos1_p = pos1_o OR pos1_p = pos2_o OR pos2_p = pos1_o OR pos2_p = pos2_o THEN
      pts_g := pts_g + 1;
    END IF;
  END LOOP;

  -- Partidos de fase de grupos
  FOR match_o IN SELECT jsonb_array_elements(s.group_k_matches) LOOP
    oh := NULLIF(match_o->>'gh','')::int;
    oa := NULLIF(match_o->>'ga','')::int;
    IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
    match_p := p.group_k_matches -> (match_o->>'id');
    IF match_p IS NULL THEN CONTINUE; END IF;
    ph := NULLIF(match_p->>'gh','')::int;
    pa := NULLIF(match_p->>'ga','')::int;
    IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
    sign_o := sign(oh - oa); sign_p := sign(ph - pa);
    IF ph = oh AND pa = oa THEN
      pts_m := pts_m + 5; c5 := c5 + 1;
    ELSIF sign_o <> 0 AND sign_p = sign_o THEN
      IF ph = oh OR pa = oa THEN
        pts_m := pts_m + 3; c3 := c3 + 1;
      ELSE
        pts_m := pts_m + 2; c2 := c2 + 1;
      END IF;
    ELSIF sign_o = 0 AND sign_p = 0 THEN
      pts_m := pts_m + 1;
    ELSIF ph = oh OR pa = oa THEN
      pts_m := pts_m + 1;
    END IF;
  END LOOP;

  -- Partidos extra (eliminatorias)
  IF s.extra_matches IS NOT NULL THEN
    FOR match_o IN SELECT jsonb_array_elements(s.extra_matches) LOOP
      oh := NULLIF(match_o->>'gh','')::int;
      oa := NULLIF(match_o->>'ga','')::int;
      IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
      match_p := p.extra_matches -> (match_o->>'id');
      IF match_p IS NULL THEN CONTINUE; END IF;
      ph := NULLIF(match_p->>'gh','')::int;
      pa := NULLIF(match_p->>'ga','')::int;
      IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
      sign_o := sign(oh - oa); sign_p := sign(ph - pa);
      IF ph = oh AND pa = oa THEN
        pts_m := pts_m + 5; c5 := c5 + 1;
      ELSIF sign_o <> 0 AND sign_p = sign_o THEN
        IF ph = oh OR pa = oa THEN
          pts_m := pts_m + 3; c3 := c3 + 1;
        ELSE
          pts_m := pts_m + 2; c2 := c2 + 1;
        END IF;
      ELSIF sign_o = 0 AND sign_p = 0 THEN
        pts_m := pts_m + 1;
      ELSIF ph = oh OR pa = oa THEN
        pts_m := pts_m + 1;
      END IF;
    END LOOP;
  END IF;

  -- Especiales: comparación normalizada (mayúsculas/espacios/acentos no rompen el acierto)
  IF s.goleador_id IS NOT NULL AND p.goleador_id IS NOT NULL
     AND public.norm_especial(p.goleador_id) = public.norm_especial(s.goleador_id) THEN
    pts_e := pts_e + 10;
  END IF;
  IF s.arquero_id IS NOT NULL AND p.arquero_id IS NOT NULL
     AND public.norm_especial(p.arquero_id) = public.norm_especial(s.arquero_id) THEN
    pts_e := pts_e + 10;
  END IF;

  UPDATE public.picks SET
    puntos_grupos = pts_g, puntos_partidos = pts_m, puntos_especiales = pts_e,
    aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _pick_id;
END;
$$;

-- ============================================================
-- 20260611120000_leaderboard_excluir_admin.sql
-- ============================================================
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

-- ============================================================
-- 20260611130000_backups_bucket.sql
-- ============================================================
-- Bucket privado para los respaldos .xlsx que genera el admin (uploadBackupToStorage).
-- Las funciones de backup usan service_role (saltan RLS), así que no requieren políticas.
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 20260611140000_comprobante_code_epoch_entero.sql
-- ============================================================
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

-- ============================================================
-- 20260611160000_picks_updated_at_solo_predicciones.sql
-- ============================================================
-- El código del comprobante deriva de picks.updated_at. El trigger picks_updated_at
-- se disparaba en CUALQUIER update (incluido calc_pick_points al recalcular puntos),
-- así que cada recálculo del admin cambiaba updated_at e invalidaba el QR de los
-- comprobantes ya descargados.
-- Fix: updated_at solo se actualiza cuando cambian las PREDICCIONES del usuario
-- (groups / group_k_matches / extra_matches / goleador_id / arquero_id), no cuando
-- solo cambian los puntos. Así el comprobante es estable salvo que el usuario edite.
--
-- OJO al tocar esta lista de columnas: picks_enforce_deadline_predicciones
-- (20260722000000_deadline_solo_predicciones.sql) usa EXACTAMENTE la misma lista
-- para decidir qué UPDATE queda sujeto al candado de cierre. Si algún día se añade
-- una columna de predicción nueva, hay que actualizar AMBOS triggers — si solo se
-- actualiza este, el candado deja de proteger ese campo nuevo en silencio.
DROP TRIGGER IF EXISTS picks_updated_at ON public.picks;
CREATE TRIGGER picks_updated_at
  BEFORE UPDATE OF groups, group_k_matches, extra_matches, goleador_id, arquero_id
  ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 20260616120000_admin_bypass_match_lock.sql
-- ============================================================
-- Permite al admin editar la planilla de cualquier participante AUNQUE el tiempo esté
-- bloqueado. El cierre global (picks_locked_at) ya eximía al admin; faltaba eximirlo del
-- bloqueo por-partido (24 h antes del kickoff). Aquí envolvemos los dos bucles de lock
-- por-partido (group_k_matches y extra_matches) en el mismo guard de admin.
--
-- Para usuarios normales NO cambia nada: siguen bloqueados 24 h antes de cada partido.
-- El resto del modelo de admin ya estaba: RLS picks_admin_all (escribe cualquier pick) y
-- picks_validate (admin exento de la inmutabilidad de lo ya guardado).
CREATE OR REPLACE FUNCTION public.enforce_picks_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock TIMESTAMPTZ;
  v_key  text;
  v_old  jsonb;
  v_new  jsonb;
BEGIN
  -- Cierre global: el admin lo salta.
  IF NOT public.has_role(auth.uid(),'admin') THEN
    SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
    IF v_lock IS NOT NULL AND now() >= v_lock THEN
      RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
    END IF;
  END IF;

  -- Bloqueo por-partido (24 h antes): el admin también lo salta.
  IF (TG_OP = 'UPDATE' OR TG_OP = 'INSERT') AND NOT public.has_role(auth.uid(),'admin') THEN
    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches, '{}'::jsonb)) LOOP
      v_new := NEW.group_k_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.group_k_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;

    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches, '{}'::jsonb)) LOOP
      v_new := NEW.extra_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.extra_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 20260617030000_picks_update_drop_stale_deadline.sql
-- ============================================================
-- Bug: la política RLS picks_own_update exigía `tournament_state.deadline > now()`,
-- pero `deadline` es una columna HEREDADA con valor fijo en el pasado
-- (2026-06-11). En el modelo actual el cierre de planillas lo controlan:
--   * picks_locked_at  (cierre global que activa el admin)        -> trigger enforce_picks_deadline
--   * lock por-partido 24 h antes del kickoff                     -> trigger enforce_picks_deadline
--   * inmutabilidad de lo ya guardado                             -> trigger picks_validate
--   * habilitación de paneles por fase (visibility/phases)        -> UI (isSectionVisible)
-- Como `deadline` ya pasó, RLS rechazaba TODA actualización de un participante y la
-- planilla mostraba en rojo "No se pudo guardar". Quitamos esa condición obsoleta:
-- el participante puede volver a guardar mientras el admin tenga la edición abierta
-- (picks_locked_at en el futuro) y el partido no esté en su ventana de 24 h.
DROP POLICY IF EXISTS "picks_own_update" ON public.picks;
CREATE POLICY "picks_own_update" ON public.picks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id
        AND p.user_id = auth.uid()
        AND p.estado_pago = 'aprobado'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id
        AND p.user_id = auth.uid()
        AND p.estado_pago = 'aprobado'
    )
  );

-- ============================================================
-- 20260625120000_seed_knockout_bracket.sql
-- ============================================================
-- Estructura CANÓNICA del bracket de eliminatorias (Mundial FIFA 2026, 48 equipos)
-- en tournament_state.extra_matches: 32 partidos (M73–M104) con sus cruces (placeholders),
-- sedes y fechas oficiales. Refleja exactamente el estado ya cargado en producción.
--
-- Fuente única en TS: src/lib/knockout-bracket.ts (buildExtraMatchesFromBracket()).
-- Este JSON debe coincidir con esa salida.
--
-- Idempotente y NO destructivo: solo siembra si extra_matches está vacío, para no
-- pisar cruces/marcadores ya cargados. Para REGENERAR a cero, el admin vacía primero
-- (UPDATE ... SET extra_matches='[]') o usa el botón "Generar" desde la UI.
--
-- No toca phases/visibility: las fases KO arrancan ocultas y el admin las activa
-- desde Cronograma cuando corresponda.

UPDATE public.tournament_state SET
  extra_matches = $JSON$
  [
    {"id":"m73","fase":"dieciseisavos","fecha":"2026-06-28T15:00:00-04:00","local":"Segundo A","visitante":"Segundo B","sede":"SoFi Stadium · Inglewood","gh":null,"ga":null},
    {"id":"m74","fase":"dieciseisavos","fecha":"2026-06-29T16:30:00-04:00","local":"Ganador E","visitante":"Mejor 3° (A/B/C/D/F)","sede":"Gillette Stadium · Foxborough","gh":null,"ga":null},
    {"id":"m75","fase":"dieciseisavos","fecha":"2026-06-29T21:00:00-04:00","local":"Ganador F","visitante":"Segundo C","sede":"Estadio BBVA · Monterrey","gh":null,"ga":null},
    {"id":"m76","fase":"dieciseisavos","fecha":"2026-06-29T13:00:00-04:00","local":"Ganador C","visitante":"Segundo F","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"m77","fase":"dieciseisavos","fecha":"2026-06-30T17:00:00-04:00","local":"Ganador I","visitante":"Mejor 3° (C/D/F/G/H)","sede":"MetLife Stadium · East Rutherford","gh":null,"ga":null},
    {"id":"m78","fase":"dieciseisavos","fecha":"2026-06-30T13:00:00-04:00","local":"Segundo E","visitante":"Segundo I","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
    {"id":"m79","fase":"dieciseisavos","fecha":"2026-06-30T21:00:00-04:00","local":"Ganador A","visitante":"Mejor 3° (C/E/F/H/I)","sede":"Estadio Azteca · Mexico City","gh":null,"ga":null},
    {"id":"m80","fase":"dieciseisavos","fecha":"2026-07-01T12:00:00-04:00","local":"Ganador L","visitante":"Mejor 3° (E/H/I/J/K)","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null},
    {"id":"m81","fase":"dieciseisavos","fecha":"2026-07-01T20:00:00-04:00","local":"Ganador D","visitante":"Mejor 3° (B/E/F/I/J)","sede":"Levi's Stadium · Santa Clara","gh":null,"ga":null},
    {"id":"m82","fase":"dieciseisavos","fecha":"2026-07-01T16:00:00-04:00","local":"Ganador G","visitante":"Mejor 3° (A/E/H/I/J)","sede":"Lumen Field · Seattle","gh":null,"ga":null},
    {"id":"m83","fase":"dieciseisavos","fecha":"2026-07-02T19:00:00-04:00","local":"Segundo K","visitante":"Segundo L","sede":"BMO Field · Toronto","gh":null,"ga":null},
    {"id":"m84","fase":"dieciseisavos","fecha":"2026-07-02T15:00:00-04:00","local":"Ganador H","visitante":"Segundo J","sede":"SoFi Stadium · Inglewood","gh":null,"ga":null},
    {"id":"m85","fase":"dieciseisavos","fecha":"2026-07-02T23:00:00-04:00","local":"Ganador B","visitante":"Mejor 3° (E/F/G/I/J)","sede":"BC Place · Vancouver","gh":null,"ga":null},
    {"id":"m86","fase":"dieciseisavos","fecha":"2026-07-03T18:00:00-04:00","local":"Ganador J","visitante":"Segundo H","sede":"Hard Rock Stadium · Miami Gardens","gh":null,"ga":null},
    {"id":"m87","fase":"dieciseisavos","fecha":"2026-07-03T21:30:00-04:00","local":"Ganador K","visitante":"Mejor 3° (D/E/I/J/L)","sede":"Arrowhead Stadium · Kansas City","gh":null,"ga":null},
    {"id":"m88","fase":"dieciseisavos","fecha":"2026-07-03T14:00:00-04:00","local":"Segundo D","visitante":"Segundo G","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
    {"id":"m89","fase":"octavos","fecha":"2026-07-04T17:00:00-04:00","local":"Ganador Partido 74","visitante":"Ganador Partido 77","sede":"Lincoln Financial Field · Philadelphia","gh":null,"ga":null},
    {"id":"m90","fase":"octavos","fecha":"2026-07-04T13:00:00-04:00","local":"Ganador Partido 73","visitante":"Ganador Partido 75","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"m91","fase":"octavos","fecha":"2026-07-05T16:00:00-04:00","local":"Ganador Partido 76","visitante":"Ganador Partido 78","sede":"MetLife Stadium · East Rutherford","gh":null,"ga":null},
    {"id":"m92","fase":"octavos","fecha":"2026-07-05T20:00:00-04:00","local":"Ganador Partido 79","visitante":"Ganador Partido 80","sede":"Estadio Azteca · Mexico City","gh":null,"ga":null},
    {"id":"m93","fase":"octavos","fecha":"2026-07-06T15:00:00-04:00","local":"Ganador Partido 83","visitante":"Ganador Partido 84","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
    {"id":"m94","fase":"octavos","fecha":"2026-07-06T20:00:00-04:00","local":"Ganador Partido 81","visitante":"Ganador Partido 82","sede":"Lumen Field · Seattle","gh":null,"ga":null},
    {"id":"m95","fase":"octavos","fecha":"2026-07-07T12:00:00-04:00","local":"Ganador Partido 86","visitante":"Ganador Partido 88","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null},
    {"id":"m96","fase":"octavos","fecha":"2026-07-07T16:00:00-04:00","local":"Ganador Partido 85","visitante":"Ganador Partido 87","sede":"BC Place · Vancouver","gh":null,"ga":null},
    {"id":"m97","fase":"cuartos","fecha":"2026-07-09T16:00:00-04:00","local":"Ganador Partido 89","visitante":"Ganador Partido 90","sede":"Gillette Stadium · Foxborough","gh":null,"ga":null},
    {"id":"m98","fase":"cuartos","fecha":"2026-07-10T15:00:00-04:00","local":"Ganador Partido 93","visitante":"Ganador Partido 94","sede":"SoFi Stadium · Inglewood","gh":null,"ga":null},
    {"id":"m99","fase":"cuartos","fecha":"2026-07-11T17:00:00-04:00","local":"Ganador Partido 91","visitante":"Ganador Partido 92","sede":"Hard Rock Stadium · Miami Gardens","gh":null,"ga":null},
    {"id":"m100","fase":"cuartos","fecha":"2026-07-11T21:00:00-04:00","local":"Ganador Partido 95","visitante":"Ganador Partido 96","sede":"Arrowhead Stadium · Kansas City","gh":null,"ga":null},
    {"id":"m101","fase":"semis","fecha":"2026-07-14T15:00:00-04:00","local":"Ganador Partido 97","visitante":"Ganador Partido 98","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
    {"id":"m102","fase":"semis","fecha":"2026-07-15T15:00:00-04:00","local":"Ganador Partido 99","visitante":"Ganador Partido 100","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null},
    {"id":"m103","fase":"tercero","fecha":"2026-07-18T17:00:00-04:00","local":"Perdedor Partido 101","visitante":"Perdedor Partido 102","sede":"Hard Rock Stadium · Miami Gardens","gh":null,"ga":null},
    {"id":"m104","fase":"final","fecha":"2026-07-19T15:00:00-04:00","local":"Ganador Partido 101","visitante":"Ganador Partido 102","sede":"MetLife Stadium · East Rutherford","gh":null,"ga":null}
  ]
  $JSON$::jsonb,
  updated_at = now()
WHERE id = 1
  AND (extra_matches IS NULL OR jsonb_array_length(extra_matches) = 0);

-- ============================================================
-- 20260625130000_knockout_phase_lock.sql
-- ============================================================
-- Plazo de eliminatorias POR RONDA (no por-partido).
--
-- Cambio de reglamento (solo eliminatorias): la planilla de una ronda KO se cierra para
-- los participantes 1 HORA antes del PRIMER partido de esa ronda/fase (dieciseisavos,
-- octavos, cuartos, semis, tercero, final). Antes era 24 h por partido.
--
-- - Grupos (group_k_matches): SIN CAMBIOS, sigue el candado de 24 h por partido (is_match_locked).
-- - Admin: conserva su bypass total (cierre global + por-ronda), como hasta ahora.
-- - Si una fase aún no tiene fechas cargadas, NO bloquea (la ronda queda abierta hasta que
--   el admin programe en Cronograma).

-- 1. ¿Está cerrada la RONDA que contiene este partido de eliminatorias?
--    true si now() >= (primer fecha de la fase) - 1 hora.
CREATE OR REPLACE FUNCTION public.is_extra_phase_locked(_match_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    now() >= MIN(NULLIF(m->>'fecha', '')::timestamptz) - interval '1 hour',
    false
  )
  FROM public.tournament_state ts,
       jsonb_array_elements(COALESCE(ts.extra_matches, '[]'::jsonb)) AS m
  WHERE ts.id = 1
    AND m->>'fase' = (
      SELECT m2->>'fase'
      FROM public.tournament_state ts2,
           jsonb_array_elements(COALESCE(ts2.extra_matches, '[]'::jsonb)) AS m2
      WHERE ts2.id = 1 AND m2->>'id' = _match_id
      LIMIT 1
    );
$function$;

-- 2. enforce_picks_deadline: el bucle de extra_matches pasa a candado POR-RONDA.
--    (basado en 20260616120000_admin_bypass_match_lock.sql; group_k_matches sin cambios)
CREATE OR REPLACE FUNCTION public.enforce_picks_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock TIMESTAMPTZ;
  v_key  text;
  v_old  jsonb;
  v_new  jsonb;
BEGIN
  -- Cierre global: el admin lo salta.
  IF NOT public.has_role(auth.uid(),'admin') THEN
    SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
    IF v_lock IS NOT NULL AND now() >= v_lock THEN
      RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
    END IF;
  END IF;

  -- Bloqueos por tiempo: el admin también los salta.
  IF (TG_OP = 'UPDATE' OR TG_OP = 'INSERT') AND NOT public.has_role(auth.uid(),'admin') THEN
    -- Grupo K: candado por-partido (24 h antes del kickoff).
    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches, '{}'::jsonb)) LOOP
      v_new := NEW.group_k_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.group_k_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;

    -- Eliminatorias: candado por-RONDA (1 h antes del primer partido de la fase).
    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches, '{}'::jsonb)) LOOP
      v_new := NEW.extra_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.extra_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_extra_phase_locked(v_key) THEN
        RAISE EXCEPTION 'Esta ronda de eliminatorias está cerrada: empezó (o está por empezar) su primer partido.';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 20260704120000_public_pick_hide_marcadores.sql
-- ============================================================
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

-- ============================================================
-- 20260715170000_auto_recalc_on_official_change.sql
-- ============================================================
-- ============================================================
-- Recalculo AUTOMATICO de puntos al cambiar datos oficiales.
--
-- Problema: recalc_all_picks() solo se ejecutaba si el frontend lo llamaba
-- tras guardar (ResultadosTab.save). Un UPDATE directo a tournament_state
-- (script, SQL, Management API) dejaba los puntos desactualizados y el podio
-- final podia publicarse con un leaderboard viejo.
--
-- Garantia: trigger AFTER UPDATE sobre tournament_state que recalcula todos
-- los picks cuando cambian resultados oficiales (groups, group_k_matches,
-- extra_matches) o los especiales (goleador_id, arquero_id).
--
-- Diseno:
--  * recalc_all_picks_internal(): recalculo SIN check de rol y con SOFT-guard
--    (si los datos oficiales son invalidos hace RAISE NOTICE y retorna 0, no
--    aborta el UPDATE que lo disparo). La seguridad la da el RLS de
--    tournament_state (solo admin/service_role pueden hacer UPDATE).
--  * recalc_all_picks(): conserva el contrato de siempre para la UI
--    (check has_role admin + guard DURO que lanza excepcion con mensaje
--    legible) y delega el recalculo en la interna.
--  * Recalcular dos veces (trigger + llamada explicita de la UI) es inocuo:
--    calc_pick_points es idempotente.
-- ============================================================

-- 1) Recalculo interno: sin check de rol, soft-guard.
CREATE OR REPLACE FUNCTION public.recalc_all_picks_internal()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; n int := 0; s record; m jsonb; k text; gobj jsonb;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  IF FOUND THEN
    FOR m IN SELECT jsonb_array_elements(COALESCE(s.group_k_matches,'[]'::jsonb)) LOOP
      IF public._gp_score_invalid(m) THEN
        RAISE NOTICE 'recalc omitido: marcador oficial invalido en group_k_matches';
        RETURN 0;
      END IF;
    END LOOP;
    FOR m IN SELECT jsonb_array_elements(COALESCE(s.extra_matches,'[]'::jsonb)) LOOP
      IF public._gp_score_invalid(m) THEN
        RAISE NOTICE 'recalc omitido: marcador oficial invalido en extra_matches';
        RETURN 0;
      END IF;
    END LOOP;
    FOR k IN SELECT jsonb_object_keys(COALESCE(s.groups,'{}'::jsonb)) LOOP
      gobj := s.groups->k;
      IF (gobj->>'pos1') IS NOT NULL AND (gobj->>'pos2') IS NOT NULL
         AND (gobj->>'pos1') = (gobj->>'pos2') THEN
        RAISE NOTICE 'recalc omitido: el grupo % tiene 1o y 2o repetidos', k;
        RETURN 0;
      END IF;
    END LOOP;
  END IF;

  FOR r IN SELECT participant_id FROM public.picks LOOP
    PERFORM public.calc_pick_points(r.participant_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

REVOKE ALL ON FUNCTION public.recalc_all_picks_internal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_all_picks_internal() TO service_role;

-- 2) recalc_all_picks(): mismo contrato para la UI (rol admin + guard duro),
--    delega el recalculo en la interna.
CREATE OR REPLACE FUNCTION public.recalc_all_picks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s record; m jsonb; k text; gobj jsonb;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  IF FOUND THEN
    FOR m IN SELECT jsonb_array_elements(COALESCE(s.group_k_matches,'[]'::jsonb)) LOOP
      IF public._gp_score_invalid(m) THEN
        RAISE EXCEPTION 'Resultados oficiales inválidos: hay un marcador de más de un dígito o incompleto.';
      END IF;
    END LOOP;
    FOR m IN SELECT jsonb_array_elements(COALESCE(s.extra_matches,'[]'::jsonb)) LOOP
      IF public._gp_score_invalid(m) THEN
        RAISE EXCEPTION 'Resultados oficiales inválidos: hay un marcador de más de un dígito o incompleto.';
      END IF;
    END LOOP;
    FOR k IN SELECT jsonb_object_keys(COALESCE(s.groups,'{}'::jsonb)) LOOP
      gobj := s.groups->k;
      IF (gobj->>'pos1') IS NOT NULL AND (gobj->>'pos2') IS NOT NULL
         AND (gobj->>'pos1') = (gobj->>'pos2') THEN
        RAISE EXCEPTION 'Resultados oficiales inválidos: el grupo % tiene 1º y 2º repetidos.', k;
      END IF;
    END LOOP;
  END IF;

  RETURN public.recalc_all_picks_internal();
END; $$;

REVOKE ALL ON FUNCTION public.recalc_all_picks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_all_picks() TO authenticated, service_role;

-- 3) Trigger: cualquier cambio real a datos oficiales/especiales recalcula.
CREATE OR REPLACE FUNCTION public.ts_recalc_on_official_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_all_picks_internal();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS ts_recalc_on_official_change ON public.tournament_state;
CREATE TRIGGER ts_recalc_on_official_change
AFTER UPDATE OF groups, group_k_matches, extra_matches, goleador_id, arquero_id
ON public.tournament_state
FOR EACH ROW
WHEN (
  NEW.groups IS DISTINCT FROM OLD.groups
  OR NEW.group_k_matches IS DISTINCT FROM OLD.group_k_matches
  OR NEW.extra_matches IS DISTINCT FROM OLD.extra_matches
  OR NEW.goleador_id IS DISTINCT FROM OLD.goleador_id
  OR NEW.arquero_id IS DISTINCT FROM OLD.arquero_id
)
EXECUTE FUNCTION public.ts_recalc_on_official_change();

-- ============================================================
-- 20260719220000_especiales_matching.sql
-- ============================================================
-- Arreglo de los puntos ESPECIALES (goleador/arquero): a la fecha NADIE tenía
-- puntos_especiales > 0 pese a que 12 picks coincidían exactamente con el oficial.
--
-- Causa raíz: los oficiales en tournament_state quedaron fuera del formato canónico
-- "Nombre (Selección)" que usan todos los picks ("Kylian Mbappé" sin selección y
-- "Unai Simón España" sin paréntesis), y calc_pick_points comparaba igualdad exacta
-- del string COMPLETO normalizado (norm_especial) → ni los picks perfectos igualaban.
--
-- Arreglo en 3 partes (una sola transacción):
--  1) especial_matches(pick, oficial): comparación POR PARTES (nombre + selección,
--     parseado como parseSpecial en TS; espejo: especialMatches en src/lib/polla.ts):
--       a) nombre completo igual (normalizado) → acierta;
--       b) typo pequeño en el nombre (levenshtein ≤ 2) + selección coincidente → acierta;
--       c) apellido solo / palabras de un lado contenidas en el otro + selección
--          presente en AMBOS lados y coincidente → acierta. Si falta la selección en
--          cualquiera de los dos lados el caso es ambiguo y NO puntúa (regla acordada;
--          medido el 19-jul-2026: 0 casos en los 74 picks).
--     Alias de selección: "Holanda" ≡ "Países Bajos". Typo de selección tolerado con
--     levenshtein ≤ 1 ("Brasill" ≡ "Brasil"). Selecciones contradictorias → nunca acierta.
--  2) calc_pick_points: igual que antes, pero los especiales usan especial_matches.
--  3) Reescribe los oficiales al formato canónico (idempotente) y recalcula todo
--     (el trigger ts_recalc_on_official_change también dispara; recalcular dos veces
--     es inocuo).

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.especial_matches(_pick text, _oficial text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m text[];
  pn text; ps text; onm text; osel text;
  sel_both boolean; sel_ok boolean;
BEGIN
  IF _pick IS NULL OR _oficial IS NULL OR btrim(_pick) = '' OR btrim(_oficial) = '' THEN
    RETURN false;
  END IF;

  -- Parse "Nombre (Selección)" — espejo de parseSpecial (TS)
  m := regexp_match(_pick, '^(.*?)\s*\(([^)]*)\)\s*$');
  IF m IS NULL THEN pn := _pick; ps := ''; ELSE pn := m[1]; ps := m[2]; END IF;
  m := regexp_match(_oficial, '^(.*?)\s*\(([^)]*)\)\s*$');
  IF m IS NULL THEN onm := _oficial; osel := ''; ELSE onm := m[1]; osel := m[2]; END IF;

  pn   := COALESCE(public.norm_especial(pn), '');
  ps   := COALESCE(public.norm_especial(ps), '');
  onm  := COALESCE(public.norm_especial(onm), '');
  osel := COALESCE(public.norm_especial(osel), '');
  IF pn = '' OR onm = '' THEN RETURN false; END IF;

  -- Alias de país
  IF ps = 'holanda' THEN ps := 'paises bajos'; END IF;
  IF osel = 'holanda' THEN osel := 'paises bajos'; END IF;

  sel_both := ps <> '' AND osel <> '';
  sel_ok := sel_both AND (ps = osel OR extensions.levenshtein(ps, osel) <= 1);

  -- Selecciones contradictorias → nunca acierta
  IF sel_both AND NOT sel_ok THEN RETURN false; END IF;

  -- a) Nombre completo igual (normalizado)
  IF pn = onm THEN RETURN true; END IF;

  -- b) Typo pequeño en el nombre, con la selección confirmando
  IF sel_ok AND extensions.levenshtein(pn, onm) <= 2 THEN RETURN true; END IF;

  -- c) Apellido solo / subconjunto de palabras, con la selección confirmando
  IF sel_ok AND (
       (SELECT bool_and(w = ANY (string_to_array(onm, ' ')))
          FROM unnest(string_to_array(pn, ' ')) AS w)
    OR (SELECT bool_and(w = ANY (string_to_array(pn, ' ')))
          FROM unnest(string_to_array(onm, ' ')) AS w)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END; $$;

REVOKE ALL ON FUNCTION public.especial_matches(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.especial_matches(text, text) TO service_role;

-- 2) calc_pick_points: idéntico salvo la sección de especiales.
CREATE OR REPLACE FUNCTION public.calc_pick_points(_pick_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record; p record; k text; gobj jsonb;
  pos1_o text; pos2_o text; pos1_p text; pos2_p text;
  pts_g int := 0; pts_m int := 0; pts_e int := 0;
  c5 int := 0; c3 int := 0; c2 int := 0;
  match_o jsonb; match_p jsonb;
  oh int; oa int; ph int; pa int;
  sign_o int; sign_p int;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.picks WHERE participant_id = _pick_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  -- Grupos: posiciones
  FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
    gobj := s.groups->k;
    pos1_o := gobj->>'pos1'; pos2_o := gobj->>'pos2';
    pos1_p := (p.groups->k)->>'pos1'; pos2_p := (p.groups->k)->>'pos2';
    IF pos1_o IS NULL OR pos2_o IS NULL OR pos1_p IS NULL OR pos2_p IS NULL THEN CONTINUE; END IF;
    IF pos1_p = pos1_o AND pos2_p = pos2_o THEN
      pts_g := pts_g + 5; c5 := c5 + 1;
    ELSIF pos1_p = pos2_o AND pos2_p = pos1_o THEN
      pts_g := pts_g + 3; c3 := c3 + 1;
    ELSIF pos1_p = pos1_o OR pos1_p = pos2_o OR pos2_p = pos1_o OR pos2_p = pos2_o THEN
      pts_g := pts_g + 1;
    END IF;
  END LOOP;

  -- Partidos de fase de grupos
  FOR match_o IN SELECT jsonb_array_elements(s.group_k_matches) LOOP
    oh := NULLIF(match_o->>'gh','')::int;
    oa := NULLIF(match_o->>'ga','')::int;
    IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
    match_p := p.group_k_matches -> (match_o->>'id');
    IF match_p IS NULL THEN CONTINUE; END IF;
    ph := NULLIF(match_p->>'gh','')::int;
    pa := NULLIF(match_p->>'ga','')::int;
    IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
    sign_o := sign(oh - oa); sign_p := sign(ph - pa);
    IF ph = oh AND pa = oa THEN
      pts_m := pts_m + 5; c5 := c5 + 1;
    ELSIF sign_o <> 0 AND sign_p = sign_o THEN
      IF ph = oh OR pa = oa THEN
        pts_m := pts_m + 3; c3 := c3 + 1;
      ELSE
        pts_m := pts_m + 2; c2 := c2 + 1;
      END IF;
    ELSIF sign_o = 0 AND sign_p = 0 THEN
      pts_m := pts_m + 1;
    ELSIF ph = oh OR pa = oa THEN
      pts_m := pts_m + 1;
    END IF;
  END LOOP;

  -- Partidos extra (eliminatorias)
  IF s.extra_matches IS NOT NULL THEN
    FOR match_o IN SELECT jsonb_array_elements(s.extra_matches) LOOP
      oh := NULLIF(match_o->>'gh','')::int;
      oa := NULLIF(match_o->>'ga','')::int;
      IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
      match_p := p.extra_matches -> (match_o->>'id');
      IF match_p IS NULL THEN CONTINUE; END IF;
      ph := NULLIF(match_p->>'gh','')::int;
      pa := NULLIF(match_p->>'ga','')::int;
      IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
      sign_o := sign(oh - oa); sign_p := sign(ph - pa);
      IF ph = oh AND pa = oa THEN
        pts_m := pts_m + 5; c5 := c5 + 1;
      ELSIF sign_o <> 0 AND sign_p = sign_o THEN
        IF ph = oh OR pa = oa THEN
          pts_m := pts_m + 3; c3 := c3 + 1;
        ELSE
          pts_m := pts_m + 2; c2 := c2 + 1;
        END IF;
      ELSIF sign_o = 0 AND sign_p = 0 THEN
        pts_m := pts_m + 1;
      ELSIF ph = oh OR pa = oa THEN
        pts_m := pts_m + 1;
      END IF;
    END LOOP;
  END IF;

  -- Especiales: comparación por partes con tolerancia (nombre + selección)
  IF public.especial_matches(p.goleador_id, s.goleador_id) THEN
    pts_e := pts_e + 10;
  END IF;
  IF public.especial_matches(p.arquero_id, s.arquero_id) THEN
    pts_e := pts_e + 10;
  END IF;

  UPDATE public.picks SET
    puntos_grupos = pts_g, puntos_partidos = pts_m, puntos_especiales = pts_e,
    aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _pick_id;
END;
$$;

-- 3) Oficiales al formato canónico (idempotente; dispara ts_recalc_on_official_change)
--    + recálculo explícito por si los valores ya estaban canónicos.
UPDATE public.tournament_state
SET goleador_id = 'Kylian Mbappé (Francia)',
    arquero_id  = 'Unai Simón (España)'
WHERE id = 1
  AND (goleador_id IS DISTINCT FROM 'Kylian Mbappé (Francia)'
    OR arquero_id  IS DISTINCT FROM 'Unai Simón (España)');

SELECT public.recalc_all_picks_internal();

-- ============================================================
-- 20260720000000_especiales_solo_apellido.sql
-- ============================================================
-- Ajuste de la regla de ESPECIALES (decisión del admin, 19-jul-2026):
-- una coincidencia aproximada vale 10 SOLO si el participante acierta poniendo
-- el apellido o parte del nombre (con la selección presente en ambos lados y
-- coincidente). El typo de escritura del nombre ("Kyllan Mbappé") deja de puntuar:
-- se elimina la regla de levenshtein sobre el nombre introducida en 20260719220000.
--
-- Queda:
--  a) nombre completo igual (normalizado) → 10;
--  c) apellido solo / palabras de un lado contenidas en el otro + selección
--     coincidente en AMBOS lados → 10;
--  todo lo demás → 0. Se conservan el alias "Holanda" ≡ "Países Bajos", la
--  tolerancia de typo en la SELECCIÓN (levenshtein ≤ 1, "Brasill") y que
--  selecciones contradictorias nunca acierten.
--
-- Efecto en datos reales: Cuculeitodelbalon pierde los 10 del goleador (typo);
-- MiraLo ("Mbappe (Francia)") los conserva. Espejo TS: especialMatches en
-- src/lib/polla.ts. El cambio de función no dispara el trigger de recálculo,
-- por eso se recalcula explícitamente al final.

CREATE OR REPLACE FUNCTION public.especial_matches(_pick text, _oficial text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m text[];
  pn text; ps text; onm text; osel text;
  sel_both boolean; sel_ok boolean;
BEGIN
  IF _pick IS NULL OR _oficial IS NULL OR btrim(_pick) = '' OR btrim(_oficial) = '' THEN
    RETURN false;
  END IF;

  -- Parse "Nombre (Selección)" — espejo de parseSpecial (TS)
  m := regexp_match(_pick, '^(.*?)\s*\(([^)]*)\)\s*$');
  IF m IS NULL THEN pn := _pick; ps := ''; ELSE pn := m[1]; ps := m[2]; END IF;
  m := regexp_match(_oficial, '^(.*?)\s*\(([^)]*)\)\s*$');
  IF m IS NULL THEN onm := _oficial; osel := ''; ELSE onm := m[1]; osel := m[2]; END IF;

  pn   := COALESCE(public.norm_especial(pn), '');
  ps   := COALESCE(public.norm_especial(ps), '');
  onm  := COALESCE(public.norm_especial(onm), '');
  osel := COALESCE(public.norm_especial(osel), '');
  IF pn = '' OR onm = '' THEN RETURN false; END IF;

  -- Alias de país
  IF ps = 'holanda' THEN ps := 'paises bajos'; END IF;
  IF osel = 'holanda' THEN osel := 'paises bajos'; END IF;

  sel_both := ps <> '' AND osel <> '';
  sel_ok := sel_both AND (ps = osel OR extensions.levenshtein(ps, osel) <= 1);

  -- Selecciones contradictorias → nunca acierta
  IF sel_both AND NOT sel_ok THEN RETURN false; END IF;

  -- a) Nombre completo igual (normalizado)
  IF pn = onm THEN RETURN true; END IF;

  -- c) Apellido solo / parte del nombre (subconjunto de palabras), con la
  --    selección confirmando en ambos lados
  IF sel_ok AND (
       (SELECT bool_and(w = ANY (string_to_array(onm, ' ')))
          FROM unnest(string_to_array(pn, ' ')) AS w)
    OR (SELECT bool_and(w = ANY (string_to_array(pn, ' ')))
          FROM unnest(string_to_array(onm, ' ')) AS w)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END; $$;

REVOKE ALL ON FUNCTION public.especial_matches(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.especial_matches(text, text) TO service_role;

SELECT public.recalc_all_picks_internal();

-- ============================================================
-- 20260720010000_especiales_typo_vale.sql
-- ============================================================
-- Ajuste final de la regla de ESPECIALES (decisión del admin, 19-jul-2026, 2ª ronda):
-- el participante que acierta el jugador tiene sus 10 puntos aunque lo escriba con un
-- error pequeño de tipeo, porque la parte reconocible del nombre + la selección
-- confirman el acierto (caso real: "Kyllan Mbappé (Francia)" → Kylian Mbappé).
-- Quien NO coincide con el oficial tiene 0.
--
-- Regla completa (revierte 20260720000000 y deja la de 20260719220000):
--  a) nombre completo igual (normalizado) → 10;
--  b) typo pequeño en el nombre (levenshtein ≤ 2) + selección coincidente → 10;
--  c) apellido solo / parte del nombre (subconjunto de palabras) + selección
--     presente en AMBOS lados y coincidente → 10 (garantizado);
--  todo lo demás → 0. Alias "Holanda" ≡ "Países Bajos"; typo de selección ≤ 1;
--  selecciones contradictorias nunca aciertan.
--
-- Efecto en datos reales: Cuculeitodelbalon recupera los 10 del goleador (115→125).
-- Espejo TS: especialMatches en src/lib/polla.ts. Recalc explícito al final.

CREATE OR REPLACE FUNCTION public.especial_matches(_pick text, _oficial text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m text[];
  pn text; ps text; onm text; osel text;
  sel_both boolean; sel_ok boolean;
BEGIN
  IF _pick IS NULL OR _oficial IS NULL OR btrim(_pick) = '' OR btrim(_oficial) = '' THEN
    RETURN false;
  END IF;

  -- Parse "Nombre (Selección)" — espejo de parseSpecial (TS)
  m := regexp_match(_pick, '^(.*?)\s*\(([^)]*)\)\s*$');
  IF m IS NULL THEN pn := _pick; ps := ''; ELSE pn := m[1]; ps := m[2]; END IF;
  m := regexp_match(_oficial, '^(.*?)\s*\(([^)]*)\)\s*$');
  IF m IS NULL THEN onm := _oficial; osel := ''; ELSE onm := m[1]; osel := m[2]; END IF;

  pn   := COALESCE(public.norm_especial(pn), '');
  ps   := COALESCE(public.norm_especial(ps), '');
  onm  := COALESCE(public.norm_especial(onm), '');
  osel := COALESCE(public.norm_especial(osel), '');
  IF pn = '' OR onm = '' THEN RETURN false; END IF;

  -- Alias de país
  IF ps = 'holanda' THEN ps := 'paises bajos'; END IF;
  IF osel = 'holanda' THEN osel := 'paises bajos'; END IF;

  sel_both := ps <> '' AND osel <> '';
  sel_ok := sel_both AND (ps = osel OR extensions.levenshtein(ps, osel) <= 1);

  -- Selecciones contradictorias → nunca acierta
  IF sel_both AND NOT sel_ok THEN RETURN false; END IF;

  -- a) Nombre completo igual (normalizado)
  IF pn = onm THEN RETURN true; END IF;

  -- b) Typo pequeño en el nombre, con la selección confirmando
  IF sel_ok AND extensions.levenshtein(pn, onm) <= 2 THEN RETURN true; END IF;

  -- c) Apellido solo / parte del nombre (subconjunto de palabras), con la
  --    selección confirmando en ambos lados
  IF sel_ok AND (
       (SELECT bool_and(w = ANY (string_to_array(onm, ' ')))
          FROM unnest(string_to_array(pn, ' ')) AS w)
    OR (SELECT bool_and(w = ANY (string_to_array(pn, ' ')))
          FROM unnest(string_to_array(onm, ' ')) AS w)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END; $$;

REVOKE ALL ON FUNCTION public.especial_matches(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.especial_matches(text, text) TO service_role;

SELECT public.recalc_all_picks_internal();

-- ============================================================
-- 20260720120000_recalc_por_categoria.sql
-- ============================================================
-- Recalculo ROBUSTO por categoría + diagnóstico (T4).
--
-- Problema: recalc_all_picks_internal() tenía un soft-guard GLOBAL: un solo marcador
-- oficial a medio llenar (gh sin ga) o un grupo con 1º=2º hacía RETURN 0 y NO se
-- recalculaba NADA — silencioso (el admin veía "Puntos recalculados" y nada cambió).
--
-- Diseño nuevo:
--  * calc_pick_points se salta CADA dato oficial inválido con CONTINUE (el filtrado
--    vive donde se itera): partido inválido → se omite ESE partido; grupo con 1º=2º
--    → se omite ESE grupo. Los ESPECIALES se calculan SIEMPRE (no dependen de
--    marcadores). La lógica de puntuación (5/3/2/1/0 y 10+10) NO cambia.
--  * recalc_all_picks_internal() RETURNS jsonb: ya no aborta; recalcula todo y
--    devuelve el reporte {participantes, partidos_omitidos, grupos_omitidos,
--    aciertos_especiales}. El guard global desaparece (redundante: el filtrado
--    por-ítem vive en calc_pick_points). La usa el trigger (PERFORM ignora el tipo).
--  * recalc_all_picks() conserva su contrato de siempre para compatibilidad:
--    RETURNS integer + check admin + guard DURO con mensaje legible (ahora ENUMERA
--    qué está inválido). No se rompe ningún llamador existente.
--  * recalc_all_picks_report() NUEVA (la usa el botón/flujo del admin): RETURNS
--    jsonb, check admin, sin guard de datos — las omisiones van en el reporte y el
--    toast del admin las muestra.

-- 1) calc_pick_points: filtrado por-ítem (única diferencia: los CONTINUE de inválidos
--    y saltar grupos oficiales con 1º=2º; la puntuación es idéntica).
CREATE OR REPLACE FUNCTION public.calc_pick_points(_pick_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record; p record; k text; gobj jsonb;
  pos1_o text; pos2_o text; pos1_p text; pos2_p text;
  pts_g int := 0; pts_m int := 0; pts_e int := 0;
  c5 int := 0; c3 int := 0; c2 int := 0;
  match_o jsonb; match_p jsonb;
  oh int; oa int; ph int; pa int;
  sign_o int; sign_p int;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.picks WHERE participant_id = _pick_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  -- Grupos: posiciones (un grupo oficial con 1º=2º se OMITE, no invalida el resto)
  FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
    gobj := s.groups->k;
    pos1_o := gobj->>'pos1'; pos2_o := gobj->>'pos2';
    pos1_p := (p.groups->k)->>'pos1'; pos2_p := (p.groups->k)->>'pos2';
    IF pos1_o IS NULL OR pos2_o IS NULL OR pos1_p IS NULL OR pos2_p IS NULL THEN CONTINUE; END IF;
    IF pos1_o = pos2_o THEN CONTINUE; END IF;  -- grupo oficial inválido: omitir
    IF pos1_p = pos1_o AND pos2_p = pos2_o THEN
      pts_g := pts_g + 5; c5 := c5 + 1;
    ELSIF pos1_p = pos2_o AND pos2_p = pos1_o THEN
      pts_g := pts_g + 3; c3 := c3 + 1;
    ELSIF pos1_p = pos1_o OR pos1_p = pos2_o OR pos2_p = pos1_o OR pos2_p = pos2_o THEN
      pts_g := pts_g + 1;
    END IF;
  END LOOP;

  -- Partidos de fase de grupos (marcador oficial o del pick inválido → omitir ESE partido)
  FOR match_o IN SELECT jsonb_array_elements(s.group_k_matches) LOOP
    IF public._gp_score_invalid(match_o) THEN CONTINUE; END IF;
    oh := NULLIF(match_o->>'gh','')::int;
    oa := NULLIF(match_o->>'ga','')::int;
    IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
    match_p := p.group_k_matches -> (match_o->>'id');
    IF match_p IS NULL OR public._gp_score_invalid(match_p) THEN CONTINUE; END IF;
    ph := NULLIF(match_p->>'gh','')::int;
    pa := NULLIF(match_p->>'ga','')::int;
    IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
    sign_o := sign(oh - oa); sign_p := sign(ph - pa);
    IF ph = oh AND pa = oa THEN
      pts_m := pts_m + 5; c5 := c5 + 1;
    ELSIF sign_o <> 0 AND sign_p = sign_o THEN
      IF ph = oh OR pa = oa THEN
        pts_m := pts_m + 3; c3 := c3 + 1;
      ELSE
        pts_m := pts_m + 2; c2 := c2 + 1;
      END IF;
    ELSIF sign_o = 0 AND sign_p = 0 THEN
      pts_m := pts_m + 1;
    ELSIF ph = oh OR pa = oa THEN
      pts_m := pts_m + 1;
    END IF;
  END LOOP;

  -- Partidos extra / eliminatorias (mismo criterio por-ítem)
  IF s.extra_matches IS NOT NULL THEN
    FOR match_o IN SELECT jsonb_array_elements(s.extra_matches) LOOP
      IF public._gp_score_invalid(match_o) THEN CONTINUE; END IF;
      oh := NULLIF(match_o->>'gh','')::int;
      oa := NULLIF(match_o->>'ga','')::int;
      IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
      match_p := p.extra_matches -> (match_o->>'id');
      IF match_p IS NULL OR public._gp_score_invalid(match_p) THEN CONTINUE; END IF;
      ph := NULLIF(match_p->>'gh','')::int;
      pa := NULLIF(match_p->>'ga','')::int;
      IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
      sign_o := sign(oh - oa); sign_p := sign(ph - pa);
      IF ph = oh AND pa = oa THEN
        pts_m := pts_m + 5; c5 := c5 + 1;
      ELSIF sign_o <> 0 AND sign_p = sign_o THEN
        IF ph = oh OR pa = oa THEN
          pts_m := pts_m + 3; c3 := c3 + 1;
        ELSE
          pts_m := pts_m + 2; c2 := c2 + 1;
        END IF;
      ELSIF sign_o = 0 AND sign_p = 0 THEN
        pts_m := pts_m + 1;
      ELSIF ph = oh OR pa = oa THEN
        pts_m := pts_m + 1;
      END IF;
    END LOOP;
  END IF;

  -- Especiales: SIEMPRE (no dependen de ningún marcador)
  IF public.especial_matches(p.goleador_id, s.goleador_id) THEN
    pts_e := pts_e + 10;
  END IF;
  IF public.especial_matches(p.arquero_id, s.arquero_id) THEN
    pts_e := pts_e + 10;
  END IF;

  UPDATE public.picks SET
    puntos_grupos = pts_g, puntos_partidos = pts_m, puntos_especiales = pts_e,
    aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _pick_id;
END;
$$;

-- 2) Reporte de datos oficiales omitibles (compartido por internal, el guard duro
--    y el reporte del admin): [{id, motivo}] de partidos y grupos inválidos.
CREATE OR REPLACE FUNCTION public._official_data_issues()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record; m jsonb; k text; gobj jsonb; motivo text;
  om_p jsonb := '[]'::jsonb; om_g jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('partidos_omitidos', om_p, 'grupos_omitidos', om_g);
  END IF;
  FOR m IN
    SELECT e FROM jsonb_array_elements(COALESCE(s.group_k_matches,'[]'::jsonb)) e
    UNION ALL
    SELECT e FROM jsonb_array_elements(COALESCE(s.extra_matches,'[]'::jsonb)) e
  LOOP
    IF public._gp_score_invalid(m) THEN
      motivo := CASE
        WHEN (m->>'gh') IS NULL OR (m->>'ga') IS NULL THEN 'marcador incompleto'
        ELSE 'marcador inválido'
      END;
      om_p := om_p || jsonb_build_object('id', m->>'id', 'motivo', motivo);
    END IF;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(COALESCE(s.groups,'{}'::jsonb)) LOOP
    gobj := s.groups->k;
    IF (gobj->>'pos1') IS NOT NULL AND (gobj->>'pos2') IS NOT NULL
       AND (gobj->>'pos1') = (gobj->>'pos2') THEN
      om_g := om_g || jsonb_build_object('id', k, 'motivo', '1º y 2º repetidos');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('partidos_omitidos', om_p, 'grupos_omitidos', om_g);
END; $$;

REVOKE ALL ON FUNCTION public._official_data_issues() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._official_data_issues() TO service_role;

-- 3) recalc_all_picks_internal(): ya no aborta; recalcula TODO y reporta.
--    (Cambia el tipo de retorno integer→jsonb: requiere DROP. El único llamador,
--    el trigger ts_recalc_on_official_change, usa PERFORM y no le afecta.)
DROP FUNCTION IF EXISTS public.recalc_all_picks_internal();

CREATE FUNCTION public.recalc_all_picks_internal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record; s record; n int := 0; issues jsonb; gol int := 0; arq int := 0;
BEGIN
  issues := public._official_data_issues();

  FOR r IN SELECT participant_id FROM public.picks LOOP
    PERFORM public.calc_pick_points(r.participant_id);
    n := n + 1;
  END LOOP;

  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  IF FOUND THEN
    SELECT count(*) FILTER (WHERE public.especial_matches(p.goleador_id, s.goleador_id)),
           count(*) FILTER (WHERE public.especial_matches(p.arquero_id, s.arquero_id))
      INTO gol, arq
      FROM public.picks p;
  END IF;

  RETURN jsonb_build_object(
    'participantes', n,
    'partidos_omitidos', issues->'partidos_omitidos',
    'grupos_omitidos', issues->'grupos_omitidos',
    'aciertos_especiales', jsonb_build_object('goleador', gol, 'arquero', arq)
  );
END; $$;

REVOKE ALL ON FUNCTION public.recalc_all_picks_internal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_all_picks_internal() TO service_role;

-- 4) recalc_all_picks(): contrato INTACTO (integer + check admin + guard DURO con
--    mensaje legible). Ahora el mensaje ENUMERA los datos inválidos.
CREATE OR REPLACE FUNCTION public.recalc_all_picks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE issues jsonb; det text;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  issues := public._official_data_issues();
  IF jsonb_array_length(issues->'partidos_omitidos') > 0
     OR jsonb_array_length(issues->'grupos_omitidos') > 0 THEN
    SELECT string_agg(x, ' · ') INTO det FROM (
      SELECT (e->>'id') || ': ' || (e->>'motivo') AS x
        FROM jsonb_array_elements(issues->'partidos_omitidos') e
      UNION ALL
      SELECT 'grupo ' || (e->>'id') || ': ' || (e->>'motivo')
        FROM jsonb_array_elements(issues->'grupos_omitidos') e
    ) t;
    RAISE EXCEPTION 'Resultados oficiales inválidos: %', det;
  END IF;

  RETURN COALESCE((public.recalc_all_picks_internal()->>'participantes')::int, 0);
END; $$;

REVOKE ALL ON FUNCTION public.recalc_all_picks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_all_picks() TO authenticated, service_role;

-- 5) recalc_all_picks_report(): la que usa el admin. Sin guard de datos: recalcula
--    por categoría y devuelve el reporte para que el toast diga la verdad.
CREATE OR REPLACE FUNCTION public.recalc_all_picks_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.recalc_all_picks_internal();
END; $$;

REVOKE ALL ON FUNCTION public.recalc_all_picks_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_all_picks_report() TO authenticated, service_role;

-- 6) Smoke: recalcula ya (idempotente; los totales no deben moverse con los datos
--    actuales) y deja el reporte a la vista en la respuesta del apply.
SELECT public.recalc_all_picks_internal();

-- ============================================================
-- 20260722000000_deadline_solo_predicciones.sql
-- ============================================================
-- Arregla el hallazgo: el candado de picks_locked_at bloquea
-- CUALQUIER recálculo (UPDATE de solo puntaje) hecho sin sesión de admin autenticada —
-- p. ej. cualquier migración/script vía Management API que dispare
-- ts_recalc_on_official_change, que encadena hasta calc_pick_points, que hace
-- `UPDATE public.picks SET puntos_grupos = ...`.
--
-- CAUSA: el único trigger de deadline vivo hoy, `picks_enforce_deadline`
-- (`BEFORE INSERT OR UPDATE ON picks`, sin restricción de columnas — ver
-- 20260625130000_knockout_phase_lock.sql), dispara con CUALQUIER UPDATE a `picks`,
-- incluido uno que solo toca puntos_grupos/puntos_partidos/puntos_especiales/
-- aciertos_5/aciertos_3/aciertos_2. Su check de "cierre global" no distingue qué
-- columnas cambian: solo mira `has_role(auth.uid(),'admin')` + `picks_locked_at`.
--
-- (NO hay trigger duplicado: `picks_deadline_trigger`, el nombre anterior, se creó el
-- 2026-06-08 y se eliminó explícitamente al día siguiente en
-- 20260609032317_1dbddfb4-b4b0-4b1b-a867-be37c0b73304.sql ("Drop duplicate deadline
-- trigger (kept picks_enforce_deadline)"). Solo queda `picks_enforce_deadline`.)
--
-- ARREGLO: el candado existe para impedir que se cambien PRONÓSTICOS después del
-- cierre, no para impedir que el sistema escriba PUNTAJES. Se separa el trigger
-- combinado en dos, reutilizando EXACTAMENTE la misma lista de columnas de predicción
-- que ya usa picks_updated_at (20260611160000_picks_updated_at_solo_predicciones.sql:
-- groups, group_k_matches, extra_matches, goleador_id, arquero_id) — no una lista nueva:
--
--   1. `picks_enforce_deadline_insert` — BEFORE INSERT (sin cambios de fondo: una
--      planilla nueva después del cierre sigue bloqueada, para todos menos el admin).
--   2. `picks_enforce_deadline_predicciones` — BEFORE UPDATE OF groups,
--      group_k_matches, extra_matches, goleador_id, arquero_id (el filtro nativo de
--      Postgres: solo dispara si el UPDATE incluye alguna de esas columnas en su SET).
--      Un UPDATE que solo toca columnas de puntaje NUNCA activa este trigger — no hace
--      falta ninguna comparación OLD/NEW escrita a mano, es el mismo mecanismo que ya
--      usa picks_updated_at, aplicado al mismo criterio.
--
-- La función `enforce_picks_deadline()` NO cambia — sigue siendo la misma, con el mismo
-- bypass de admin y los mismos candados por-partido/por-ronda (que ya estaban
-- correctamente acotados: comparan NEW vs OLD antes de aplicar el candado, así que
-- nunca fueron parte de este bug). Solo cambian los DOS triggers que la invocan.
--
-- NO se exime a service_role en bloque, ni se toca el comportamiento para
-- participantes: cualquier UPDATE que toque una columna de predicción —sea quien sea
-- el llamador, con sesión o sin ella— sigue pasando por el candado exactamente igual
-- que hoy.

DROP TRIGGER IF EXISTS picks_enforce_deadline ON public.picks;

CREATE TRIGGER picks_enforce_deadline_insert
  BEFORE INSERT ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_picks_deadline();

-- OJO al tocar esta lista de columnas: picks_updated_at
-- (20260611160000_picks_updated_at_solo_predicciones.sql) usa EXACTAMENTE la misma
-- lista para decidir cuándo se mueve picks.updated_at (y por lo tanto el código del
-- comprobante QR). Si algún día se añade una columna de predicción nueva, hay que
-- actualizar AMBOS triggers — si solo se actualiza aquél, el candado de cierre deja
-- de proteger ese campo nuevo en silencio.
CREATE TRIGGER picks_enforce_deadline_predicciones
  BEFORE UPDATE OF groups, group_k_matches, extra_matches, goleador_id, arquero_id
  ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_picks_deadline();

-- Verificado con E2E transaccional (scripts/e2e_deadline_solo_predicciones.mjs, ROLLBACK)
-- antes de aplicar: reproduce el bug sin el parche, confirma los 4 casos con el parche
-- dentro de la misma transacción, y verifica que las sumas de puntaje no cambian.

-- ============================================================
-- 20260723000000_ts_validate_scores.sql
-- ============================================================
-- Agrega la validación que faltaba: no existía NINGUNA a nivel BD sobre
-- tournament_state.group_k_matches / extra_matches. picks_validate cubre `picks`, pero
-- el estado OFICIAL se podía escribir a medias (gh sin ga) desde cualquier vía — UI,
-- script, o Management API directo. `_gp_score_invalid` (la misma función que usa
-- picks_validate) es la definición canónica de "parcial = inválido".
--
-- POR QUÉ ESTA VERSIÓN Y NO LA OBVIA (rechazar cualquier UPDATE con un solo marcador
-- inválido en cualquier parte del arreglo, como hace picks_validate con los picks de UN
-- participante):
--
--   tournament_state es un singleton compartido que se edita de forma incremental durante
--   MESES (grupo por grupo, fecha por fecha). Un trigger que revalidara el arreglo ENTERO
--   en cada guardado bloquearía CUALQUIER guardado futuro —incluso a un partido totalmente
--   distinto— mientras exista UN SOLO marcador olvidado a medias en cualquier parte del
--   torneo. Ese es exactamente el escenario que el banner persistente del admin (aviso de
--   resultados oficiales incompletos, jul-2026) existe para señalar SIN bloquear: T4 quitó
--   a propósito el bloqueo global de save() por esta misma razón. Un trigger duro lo
--   resucitaría, pero peor: en vez de un toast legible, el admin vería una excepción de
--   Postgres cruda y quedaría "atascado" — no puede corregir NADA más hasta encontrar y
--   arreglar el partido viejo que ni siquiera estaba tocando. Misma familia de riesgo que
--   enforce_picks_deadline bloqueando un recálculo por una condición ajena a lo que se
--   está guardando (ver 20260722000000_deadline_solo_predicciones.sql).
--
--   Por eso esta versión compara OLD vs NEW: SOLO valida los partidos cuyo gh/ga CAMBIA
--   en este UPDATE (o que son nuevos). Un marcador ya inválido que el UPDATE actual no
--   toca se deja pasar (ya lo señala el banner persistente; no bloquea nada nuevo). Análogo
--   a la parte de INMUTABILIDAD de picks_validate (que también diffea OLD vs NEW por
--   clave) — no a su parte de validez, que sí es incondicional sobre TODO el arreglo de
--   NEW, y que es segura ahí solo porque cada fila de `picks` es aislada por participante
--   (el error de uno no bloquea a los demás ni al admin).
--
-- INTERACCIÓN CON enforce_picks_deadline: ninguna directa. Ese trigger vive en `picks`,
-- BEFORE UPDATE; el recálculo (ts_recalc_on_official_change) es AFTER UPDATE en
-- tournament_state; esta validación es OTRO trigger BEFORE UPDATE en tournament_state,
-- corre ANTES de llegar siquiera al recálculo. A diferencia de enforce_picks_deadline,
-- NO depende de auth.uid()/sesión — se comporta igual para la UI del admin, un script vía
-- Management API, o cualquier otra vía.
--
-- VERIFICADO CONTRA FLUJOS REALES (solo lectura): apply_official_data.mjs y las 5
-- migraciones que escriben group_k_matches/extra_matches con gh/ga siembran SIEMPRE
-- ambos campos null juntos (nunca parcial) — ninguna se ve afectada.
--
-- E2E transaccional (scripts/e2e_ts_validate_scores.mjs, ROLLBACK) contra producción ya
-- migrada, 3 casos:
--   1. Marcador NUEVO a medias en el UPDATE actual → rechazado.
--   2. UPDATE que solo toca OTRO partido, sin tocar un marcador viejo ya a medias →
--      pasa, y el marcador viejo queda intacto (la razón de ser del diseño diff-based).
--   3. Reescritura MASIVA del arreglo, tipo seed_knockout_bracket (reset a [] + resiembra
--      32 entradas de una vez, todas "nuevas" para el diff) → pasa.

CREATE OR REPLACE FUNCTION public._ts_validate_scores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  m jsonb;
  old_m jsonb;
  mid text;
BEGIN
  -- group_k_matches: array de partidos (no objeto por id, a diferencia de picks) —
  -- se casa OLD↔NEW por el campo "id" de cada elemento.
  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.group_k_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.group_k_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      RAISE EXCEPTION
        'Marcador oficial inválido en group_k_matches (partido %): usa un solo dígito (0–9) en ambos campos, o déjalos vacíos si no se ha jugado.',
        mid;
    END IF;
  END LOOP;

  -- extra_matches: mismo criterio (también array, con "fase" además de "id").
  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.extra_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.extra_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      RAISE EXCEPTION
        'Marcador oficial inválido en extra_matches (partido %): usa un solo dígito (0–9) en ambos campos, o déjalos vacíos si no se ha jugado.',
        mid;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._ts_validate_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ts_validate_scores() TO service_role, authenticated;

DROP TRIGGER IF EXISTS ts_validate_scores ON public.tournament_state;
CREATE TRIGGER ts_validate_scores
  BEFORE UPDATE ON public.tournament_state
  FOR EACH ROW
  WHEN (
    NEW.group_k_matches IS DISTINCT FROM OLD.group_k_matches
    OR NEW.extra_matches IS DISTINCT FROM OLD.extra_matches
  )
  EXECUTE FUNCTION public._ts_validate_scores();

-- ============================================================
-- 20260724000000_ts_validate_scores_mensaje.sql
-- ============================================================
-- Mejora el mensaje de error de ts_validate_scores (20260723000000). El original solo
-- decía "Marcador oficial inválido en group_k_matches (partido 1): ..." — un admin con
-- prisa una noche de partido no sabe qué partido es "1" sin abrir la BD o el código.
--
-- No toca el TRIGGER (ya correcto y verificado, ver 20260723000000): solo CREATE OR
-- REPLACE de la función que invoca, más una función auxiliar nueva.
--
-- Elegí (a) — resolver el nombre del equipo en SQL — sobre (b) —solo dar fase/fecha/
-- códigos—: la resolución es una función SQL de un solo SELECT (~10 líneas,
-- _ts_team_name), no la complejidad "apreciable" que haría preferible (b). group_k_matches
-- y extra_matches usan códigos de 3 letras que SÍ están en NEW.groups.<letra>.teams (id →
-- nombre), disponible sin cambiar el trigger. Para los cruces de eliminatorias aún sin
-- resolver (p.ej. "Ganador Partido 74"), la búsqueda no encuentra coincidencia y el
-- COALESCE devuelve el texto tal cual — que ya es legible por sí solo, así que la misma
-- función sirve para ambos casos sin lógica condicional extra.
--
-- El mensaje ahora dice fase (o "fase de grupos"), fecha, ambos nombres de equipo, el id
-- del partido (para cruzar con la UI si hace falta), y CUÁL de los dos goles falta —no
-- solo que algo está mal.
--
-- Mensajes reales, capturados con un E2E transaccional (ROLLBACK garantizado) contra
-- producción antes de aplicar esto:
--   group_k_matches (id "1", MEX-RSA, gh=2/ga=null):
--     "Marcador oficial inválido — fase de grupos · 2026-06-11 · México vs Sudáfrica
--      (partido 1): falta el gol del visitante."
--   extra_matches (id "m99", cuartos NOR-ENG, gh=null/ga=3):
--     "Marcador oficial inválido — cuartos · 2026-07-11 · Noruega vs Inglaterra
--      (partido m99): falta el gol del local."
-- Y el fallback para un cruce KO aún sin resolver se confirmó por separado:
-- _ts_team_name(groups, 'Ganador Partido 74') devuelve 'Ganador Partido 74' tal cual
-- (no encuentra ese código en groups.teams, COALESCE cae al texto original).

CREATE OR REPLACE FUNCTION public._ts_team_name(_groups jsonb, _code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (SELECT t->>'nombre'
       FROM jsonb_each(_groups) g(gk, gv), jsonb_array_elements(gv->'teams') t
      WHERE t->>'id' = _code
      LIMIT 1),
    _code
  );
$$;

REVOKE ALL ON FUNCTION public._ts_team_name(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ts_team_name(jsonb, text) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public._ts_validate_scores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  m jsonb;
  old_m jsonb;
  mid text;
  v_falta text;
  v_local text;
  v_visitante text;
BEGIN
  -- group_k_matches: array de partidos (no objeto por id, a diferencia de picks) —
  -- se casa OLD↔NEW por el campo "id" de cada elemento.
  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.group_k_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.group_k_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      v_falta := CASE
        WHEN (m->>'gh') IS NULL THEN 'falta el gol del local'
        WHEN (m->>'ga') IS NULL THEN 'falta el gol del visitante'
        ELSE 'el marcador debe ser un solo dígito (0–9) en ambos campos'
      END;
      v_local := public._ts_team_name(NEW.groups, m->>'local');
      v_visitante := public._ts_team_name(NEW.groups, m->>'visitante');
      RAISE EXCEPTION
        'Marcador oficial inválido — fase de grupos · % · % vs % (partido %): %.',
        split_part(m->>'fecha', 'T', 1), v_local, v_visitante, mid, v_falta;
    END IF;
  END LOOP;

  -- extra_matches: mismo criterio (también array, con "fase" además de "id").
  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.extra_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.extra_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      v_falta := CASE
        WHEN (m->>'gh') IS NULL THEN 'falta el gol del local'
        WHEN (m->>'ga') IS NULL THEN 'falta el gol del visitante'
        ELSE 'el marcador debe ser un solo dígito (0–9) en ambos campos'
      END;
      v_local := public._ts_team_name(NEW.groups, m->>'local');
      v_visitante := public._ts_team_name(NEW.groups, m->>'visitante');
      RAISE EXCEPTION
        'Marcador oficial inválido — % · % · % vs % (partido %): %.',
        m->>'fase', split_part(m->>'fecha', 'T', 1), v_local, v_visitante, mid, v_falta;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._ts_validate_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ts_validate_scores() TO service_role, authenticated;

-- ============================================================
-- 20260725000000_repechaje_schema.sql
-- ============================================================
-- Esquema para el "Repechaje": competencia de segunda oportunidad (semis + final, 5/3/2/1/0)
-- 100% separada de la polla original — tabla y pozo propios, abierta a cualquiera, pago
-- propio que aprueba el admin, sin cálculo de premios en la app (eso lo reparte el admin
-- fuera de la app). Solo esquema — sin UI todavía.
--
-- OJO DE NOMBRE — colisión con un concepto YA EXISTENTE: "Repechaje/Repechajes" en este
-- código ya significa otra cosa — la resolución de los 6 cupos de clasificación FIFA
-- (admin.t.res.repechajes en tabs.tsx/translations.ts, "Ganador Repechaje X" en Cronograma,
-- y la nota de ScoringRulesPanel sobre alargue/penales). Es una coincidencia de nombre, no
-- de concepto: uno es "cómo un equipo llegó al Mundial", el otro es "una segunda polla sobre
-- semis/final". No resuelto aquí (es una decisión de producto, no de esquema) — cualquiera
-- que grep "repechaje" en el futuro va a mezclar ambos, tenlo presente.
--
-- ============================================================================
-- 1) DOS GUARDAS INDEPENDIENTES para que un inscrito solo-repechaje jamás aparezca en la
--    tabla principal (get_polla_leaderboard):
--
--    Guarda A (ya existía, accidental): estado_pago = 'aprobado'.
--    Guarda B (nueva, explícita):       en_polla_original = true.
--
--    Por qué DOS y no una convención: la guarda A depende de que nadie apruebe por error el
--    pago PRINCIPAL de alguien que solo pagó repechaje — el error humano de un bar lleno un
--    sábado, dos filas de pago con el mismo participante delante. Con la guarda B, ese error
--    de un solo campo (estado_pago) ya no basta: hace falta ADEMÁS que alguien ponga
--    en_polla_original = true, una acción separada, en un campo que ninguna pantalla de
--    aprobación de pago va a tocar por accidente (no existe ningún flujo que lo setee salvo
--    el admin explícitamente, o este backfill).
--
--    Alternativa descartada: una tabla `repechaje_participants` separada en vez de reusar
--    `participants`. Reusar participants mantiene el login alias+PIN (auth.users/
--    participants.user_id) sin duplicar auth.
--
-- ============================================================================
-- 2) participants: las dos columnas nuevas.
--
--    en_polla_original boolean NOT NULL DEFAULT false — fail-closed a propósito: cualquier
--    fila NUEVA (un futuro alta solo-repechaje) nace FUERA de la tabla principal salvo que
--    alguien la marque explícitamente. Los 41 participants actuales (37 aprobados + 4
--    rechazados) se marcan true en este backfill — TODOS, no solo los 37 aprobados: esta
--    columna trackea de qué COHORTE viene la fila (¿pasó por el alta de la polla original?),
--    no si terminó aprobada. Un rechazado de la polla original sigue siendo, legítimamente,
--    alguien "de la polla original" — si el admin corrige su estado_pago más adelante (un
--    error de aprobación, no de bucket), debe poder aparecer en la principal exactamente
--    igual que cualquier otro aprobado. Lo que la guarda B existe para impedir es la otra
--    dirección: que alguien que NUNCA pasó por ahí (solo-repechaje) se cuele.
--
--    estado_pago_repechaje text NULLABLE, mismo CHECK de valores que estado_pago
--    ('pendiente'/'aprobado'/'rechazado') — NULL para los 41 actuales (no se inscribieron a
--    esto, no existía). NULL es intencional y distinto de 'pendiente': "nunca aplicó" vs
--    "aplicó, en espera". El CHECK con IN(...) ya permite NULL de forma nativa en Postgres.
--
--    INSERT policy: se agrega `AND en_polla_original = false` al WITH CHECK de
--    participants_own_insert, en el mismo espíritu que el `AND estado_pago = 'pendiente'`
--    que ya tenía — un alta propia (self-signup) nunca puede marcarse a sí misma como ya
--    perteneciente a la polla original. Solo el admin (participants_admin_all, FOR ALL) puede
--    tocar esta columna después del insert — y no hay ninguna policy own_update en
--    participants hoy, así que ya está cerrado por diseño para no-admins.

ALTER TABLE public.participants
  ADD COLUMN en_polla_original boolean NOT NULL DEFAULT false,
  ADD COLUMN estado_pago_repechaje text
    CHECK (estado_pago_repechaje IN ('pendiente','aprobado','rechazado'));

UPDATE public.participants SET en_polla_original = true;

DROP POLICY IF EXISTS "participants_own_insert" ON public.participants;
CREATE POLICY "participants_own_insert" ON public.participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND estado_pago = 'pendiente' AND en_polla_original = false);

-- ============================================================================
-- 3) tournament_state: candado propio del repechaje.
--
--    repechaje_abierto boolean NOT NULL DEFAULT false — flag manual (no una fecha calculada):
--    el admin lo prende al llegar a cuartos, igual de estilo que los toggles de fase/
--    visibilidad que ya existen en Cronograma. Arranca cerrado: nadie puede inscribirse ni
--    guardar picks de repechaje hasta que el admin decida que es momento.
--
--    repechaje_locked_at timestamptz NOT NULL DEFAULT — mismo patrón que picks_locked_at
--    (NOT NULL, con un valor real, no un placeholder vacío): 1h antes del primer partido de
--    semis (m101, 2026-07-14T15:00:00-04:00), el mismo margen que ya usa el candado por-ronda
--    de eliminatorias (is_extra_phase_locked). El admin puede recorrerlo más adelante si
--    hace falta, exactamente como ya hace con picks_locked_at.

ALTER TABLE public.tournament_state
  ADD COLUMN repechaje_abierto boolean NOT NULL DEFAULT false,
  ADD COLUMN repechaje_locked_at timestamptz NOT NULL DEFAULT '2026-07-14T14:00:00-04:00';

-- ============================================================================
-- 4) repechaje_picks — misma forma que picks, pero solo con lo que el repechaje necesita:
--    sin groups/group_k_matches/goleador_id/arquero_id (el repechaje no puntúa nada de eso).
--    puntos NO es una columna generada (a diferencia de picks.puntos_total, que suma 3
--    categorías): el repechaje solo tiene una, así que es un entero plano que escribe
--    calc_repechaje_points.

CREATE TABLE public.repechaje_picks (
  participant_id uuid PRIMARY KEY REFERENCES public.participants(id) ON DELETE CASCADE,
  extra_matches jsonb NOT NULL DEFAULT '{}'::jsonb,
  puntos integer NOT NULL DEFAULT 0,
  aciertos_5 integer NOT NULL DEFAULT 0,
  aciertos_3 integer NOT NULL DEFAULT 0,
  aciertos_2 integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repechaje_picks TO authenticated;
GRANT ALL ON public.repechaje_picks TO service_role;
ALTER TABLE public.repechaje_picks ENABLE ROW LEVEL SECURITY;

-- Mismas policies que picks (own_read/own_insert/own_update/admin_all), pero el gate de
-- "aprobado" mira estado_pago_repechaje, NO estado_pago — la aprobación de una competencia
-- no debe habilitar la otra. A diferencia de picks_own_update (que además revisa
-- tournament_state.deadline, un mecanismo paralelo al trigger enforce_picks_deadline y con
-- pinta de resabio histórico), el candado de tiempo del repechaje vive SOLO en el trigger de
-- abajo — un único mecanismo, no dos que puedan desalinearse.
CREATE POLICY "repechaje_picks_own_read" ON public.repechaje_picks
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = participant_id AND p.user_id = auth.uid())
  );

CREATE POLICY "repechaje_picks_own_insert" ON public.repechaje_picks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid() AND p.estado_pago_repechaje = 'aprobado'
    )
  );

CREATE POLICY "repechaje_picks_own_update" ON public.repechaje_picks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid() AND p.estado_pago_repechaje = 'aprobado'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid() AND p.estado_pago_repechaje = 'aprobado'
    )
  );

CREATE POLICY "repechaje_picks_admin_all" ON public.repechaje_picks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- 4a) Validación: solo partidos de semis/final, marcador 0–9 completo o vacío,
--     inmutable para no-admin una vez guardado (mismo criterio que picks_validate,
--     BEFORE INSERT OR UPDATE sin restricción de columnas es seguro aquí por la misma razón
--     que en picks_validate: cada chequeo compara NEW vs OLD o NEW solo, así que en un
--     UPDATE de solo puntaje —extra_matches sin tocar— nunca dispara nada).
CREATE OR REPLACE FUNCTION public.repechaje_picks_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text; oldv jsonb;
  is_admin boolean;
BEGIN
  is_admin := public.has_role(auth.uid(),'admin');

  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches,'{}'::jsonb)) LOOP
    IF public._gp_score_invalid(NEW.extra_matches->k) THEN
      RAISE EXCEPTION 'Marcador inválido en el partido %: usa un solo dígito (0–9) en ambos campos.', k;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tournament_state ts, jsonb_array_elements(COALESCE(ts.extra_matches,'[]'::jsonb)) m
      WHERE ts.id = 1 AND m->>'id' = k AND m->>'fase' IN ('semis','final')
    ) THEN
      RAISE EXCEPTION 'El partido % no es de semis ni de la final — el repechaje solo pronostica esas dos rondas.', k;
    END IF;
  END LOOP;

  IF NOT is_admin AND TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(COALESCE(OLD.extra_matches,'{}'::jsonb)) LOOP
      oldv := OLD.extra_matches->k;
      IF (oldv->>'gh') IS NOT NULL AND (NEW.extra_matches->k->>'gh') IS DISTINCT FROM (oldv->>'gh') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
      IF (oldv->>'ga') IS NOT NULL AND (NEW.extra_matches->k->>'ga') IS DISTINCT FROM (oldv->>'ga') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.repechaje_picks_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repechaje_picks_validate() TO service_role;

DROP TRIGGER IF EXISTS repechaje_picks_validate_before ON public.repechaje_picks;
CREATE TRIGGER repechaje_picks_validate_before
  BEFORE INSERT OR UPDATE ON public.repechaje_picks
  FOR EACH ROW EXECUTE FUNCTION public.repechaje_picks_validate();

-- ---------------------------------------------------------------------------
-- 4b) Candado de tiempo — LA LECCIÓN DEL HALLAZGO #20 aplicada desde el día uno (ver
--     20260722000000_deadline_solo_predicciones.sql): DOS triggers, no uno. Un solo
--     `BEFORE UPDATE` sin restricción de columnas dispararía con el UPDATE de SOLO PUNTAJE
--     que hace calc_repechaje_points — exactamente el bug que se arregló en `picks`,
--     reproducido en la primera noche que alguien recalcule sin sesión de admin
--     (Management API, script, o el propio trigger de recálculo si algún día se conecta uno
--     a tournament_state). BEFORE UPDATE OF extra_matches asegura que un UPDATE que solo
--     toca puntos/aciertos NUNCA pasa por este candado.
CREATE OR REPLACE FUNCTION public.enforce_repechaje_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_abierto boolean;
  v_lock timestamptz;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN
    RETURN NEW;
  END IF;
  SELECT repechaje_abierto, repechaje_locked_at INTO v_abierto, v_lock
    FROM public.tournament_state WHERE id = 1;
  IF NOT COALESCE(v_abierto, false) THEN
    RAISE EXCEPTION 'El repechaje todavía no está abierto.';
  END IF;
  IF v_lock IS NOT NULL AND now() >= v_lock THEN
    RAISE EXCEPTION 'El repechaje está cerrado. Habla con el admin si necesitas un cambio.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_repechaje_deadline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS repechaje_picks_enforce_deadline_insert ON public.repechaje_picks;
CREATE TRIGGER repechaje_picks_enforce_deadline_insert
  BEFORE INSERT ON public.repechaje_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_repechaje_deadline();

DROP TRIGGER IF EXISTS repechaje_picks_enforce_deadline_predicciones ON public.repechaje_picks;
CREATE TRIGGER repechaje_picks_enforce_deadline_predicciones
  BEFORE UPDATE OF extra_matches ON public.repechaje_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_repechaje_deadline();

CREATE TRIGGER repechaje_picks_updated_at
  BEFORE UPDATE OF extra_matches ON public.repechaje_picks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 5) Puntuación: UN SOLO lugar para la regla de marcador (5/3/2/1/0), no una tercera copia.
--
--    calc_pick_points ya trae la regla ESCRITA DOS VECES adentro de sí misma (una para
--    group_k_matches, otra idéntica para extra_matches) — no es este cambio quien introduce
--    esa duplicación, ya estaba. Extraigo esa lógica a _match_pts(oficial, pick) → puntos,
--    como función NUEVA e independiente, y la uso desde calc_repechaje_points.
--    Deliberadamente NO toco calc_pick_points para que también la use: refactorizar la
--    función de puntuación más auditada y con más dinero real ya liquidado detrás (37
--    participantes, torneo cerrado) por una ganancia puramente cosmética de DRY es el tipo de
--    cambio de "cero beneficio, riesgo real" que no vale la pena — sobre todo cuando el
--    resultado de tocarla mal no es un error de compilación, es puntos mal calculados en un
--    torneo que ya terminó. Si se decide más adelante que vale la pena unificarlas, es un
--    cambio propio con su propio E2E completo contra los 37 picks reales.
--
--    _match_pts verificado exactamente equivalente a matchPts() (src/lib/polla.ts, ya
--    auditada contra calc_pick_points) en 16 900 combinaciones (oh,oa,ph,pa) — 100% de
--    coincidencia en el dominio donde ambas deben coincidir (oficial válido).
CREATE OR REPLACE FUNCTION public._match_pts(match_o jsonb, match_p jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  oh int; oa int; ph int; pa int;
  sign_o int; sign_p int;
BEGIN
  -- Oficial inválido o incompleto: este partido no puntúa para NADIE (NULL, no 0 — el
  -- llamador debe omitirlo de aciertos/pts, no sumarle un 0 que sí "cuenta" el partido).
  IF public._gp_score_invalid(match_o) THEN RETURN NULL; END IF;
  oh := NULLIF(match_o->>'gh','')::int;
  oa := NULLIF(match_o->>'ga','')::int;
  IF oh IS NULL OR oa IS NULL THEN RETURN NULL; END IF;

  -- Pick ausente/inválido/incompleto: el oficial SÍ es válido, así que el partido cuenta
  -- (0 puntos), a diferencia del caso anterior.
  IF match_p IS NULL OR public._gp_score_invalid(match_p) THEN RETURN 0; END IF;
  ph := NULLIF(match_p->>'gh','')::int;
  pa := NULLIF(match_p->>'ga','')::int;
  IF ph IS NULL OR pa IS NULL THEN RETURN 0; END IF;

  sign_o := sign(oh - oa);
  sign_p := sign(ph - pa);
  IF ph = oh AND pa = oa THEN RETURN 5; END IF;
  IF sign_o <> 0 AND sign_p = sign_o THEN
    IF ph = oh OR pa = oa THEN RETURN 3; ELSE RETURN 2; END IF;
  END IF;
  IF sign_o = 0 AND sign_p = 0 THEN RETURN 1; END IF;
  IF ph = oh OR pa = oa THEN RETURN 1; END IF;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public._match_pts(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._match_pts(jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.calc_repechaje_points(_participant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record; p record; match_o jsonb; pts int;
  pts_total int := 0; c5 int := 0; c3 int := 0; c2 int := 0;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.repechaje_picks WHERE participant_id = _participant_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  FOR match_o IN SELECT jsonb_array_elements(COALESCE(s.extra_matches, '[]'::jsonb)) LOOP
    IF match_o->>'fase' NOT IN ('semis','final') THEN CONTINUE; END IF;
    pts := public._match_pts(match_o, p.extra_matches -> (match_o->>'id'));
    IF pts IS NULL THEN CONTINUE; END IF;
    pts_total := pts_total + pts;
    IF pts = 5 THEN c5 := c5 + 1;
    ELSIF pts = 3 THEN c3 := c3 + 1;
    ELSIF pts = 2 THEN c2 := c2 + 1;
    END IF;
  END LOOP;

  UPDATE public.repechaje_picks SET
    puntos = pts_total, aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _participant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calc_repechaje_points(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6) Leaderboards: la principal gana la guarda B, el repechaje tiene la suya propia
--    (mismo desempate 5→3→2 que get_polla_leaderboard, sin premios ni reparto de pozo —
--    eso lo hace el admin fuera de la app, no se construye acá).

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
    AND pa.en_polla_original = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = pa.user_id AND ur.role = 'admin'
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_repechaje_leaderboard()
 RETURNS TABLE(participant_id uuid, nombre text, puntos int, aciertos_5 int, aciertos_3 int, aciertos_2 int, posicion bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    pa.id, pa.nombre,
    COALESCE(rp.puntos, 0),
    COALESCE(rp.aciertos_5, 0),
    COALESCE(rp.aciertos_3, 0),
    COALESCE(rp.aciertos_2, 0),
    RANK() OVER (ORDER BY
      COALESCE(rp.puntos,0) DESC,
      COALESCE(rp.aciertos_5,0) DESC,
      COALESCE(rp.aciertos_3,0) DESC,
      COALESCE(rp.aciertos_2,0) DESC)
  FROM public.participants pa
  LEFT JOIN public.repechaje_picks rp ON rp.participant_id = pa.id
  WHERE pa.estado_pago_repechaje = 'aprobado'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = pa.user_id AND ur.role = 'admin'
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_repechaje_leaderboard() TO anon, authenticated, service_role;

-- ============================================================================
-- PENDIENTE PARA CUANDO SE CONSTRUYA LA UI (fuera de alcance de esta migración):
--   - No hay recálculo automático al guardar semis/final: ts_recalc_on_official_change
--     (AFTER UPDATE en tournament_state) hoy solo dispara recalc_all_picks_internal(),
--     no calc_repechaje_points. Conectar eso es una decisión explícita de la próxima
--     tarea, no algo para colar aquí sin discutirlo.
--   - Ningún flujo de alta/pago/aprobación de repechaje existe todavía (ni en el admin ni
--     en el signup). Este archivo es solo el esquema que esos flujos van a necesitar.

-- ============================================================
-- 20260726000000_repechaje_a_revancha.sql
-- ============================================================
-- Renombra "repechaje" → "REVANCHA" en todo lo que introdujo 20260725000000_repechaje_schema.sql
-- (tabla, columnas, funciones, triggers, políticas, constraints/índices auto-generados). Esa
-- migración NO se toca ni se reescribe — el historial debe reflejar la evolución real.
--
-- POR QUÉ: "repechaje" ya significa otra cosa en el reglamento oficial que los participantes
-- aceptaron — ScoringRulesPanel: "Si hay repechaje (alargue o penales), no cuenta". Se hace
-- AHORA porque es el momento más barato: cero filas en revancha_picks, cero UI construida,
-- nadie inscrito. La acepción de alargue/penales NO se toca (ScoringRulesPanel, reglas/, y
-- cualquier texto del reglamento siguen diciendo "repechaje" — es la legítima).
--
-- No se renombra participants.en_polla_original: no colisiona con nada y su nombre es bueno.
--
-- Cambio de nombre de columna al vuelo: tournament_state.repechaje_abierto -> revancha_abierta
-- (concordancia de género: "la revancha... abierta", no "repechaje_abierto" con "o" residual).

-- ============================================================================
-- 1) Tabla: rename + sus constraints/índice auto-generados (el RENAME TO de una tabla NO
--    renombra en cascada los nombres de PK/FK que Postgres generó con el nombre viejo).
-- ============================================================================
ALTER TABLE public.repechaje_picks RENAME TO revancha_picks;
ALTER TABLE public.revancha_picks RENAME CONSTRAINT repechaje_picks_pkey TO revancha_picks_pkey;
ALTER TABLE public.revancha_picks
  RENAME CONSTRAINT repechaje_picks_participant_id_fkey TO revancha_picks_participant_id_fkey;

-- Las 4 políticas RLS se quedan adjuntas a la tabla renombrada (Postgres las sigue por OID),
-- pero conservan su nombre viejo salvo que se renombren explícitamente.
ALTER POLICY "repechaje_picks_own_read" ON public.revancha_picks RENAME TO "revancha_picks_own_read";
ALTER POLICY "repechaje_picks_own_insert" ON public.revancha_picks RENAME TO "revancha_picks_own_insert";
ALTER POLICY "repechaje_picks_own_update" ON public.revancha_picks RENAME TO "revancha_picks_own_update";
ALTER POLICY "repechaje_picks_admin_all" ON public.revancha_picks RENAME TO "revancha_picks_admin_all";

-- ============================================================================
-- 2) Columnas.
-- ============================================================================
ALTER TABLE public.participants RENAME COLUMN estado_pago_repechaje TO estado_pago_revancha;
ALTER TABLE public.participants
  RENAME CONSTRAINT participants_estado_pago_repechaje_check TO participants_estado_pago_revancha_check;

ALTER TABLE public.tournament_state RENAME COLUMN repechaje_abierto TO revancha_abierta;
ALTER TABLE public.tournament_state RENAME COLUMN repechaje_locked_at TO revancha_locked_at;

-- ============================================================================
-- 3) Validación de revancha_picks — mismo cuerpo que repechaje_picks_validate, nombre nuevo.
--    DROP del trigger antes que la función (la función no se puede borrar mientras algo la
--    referencia), luego CREATE FUNCTION + CREATE TRIGGER con el nombre nuevo.
-- ============================================================================
DROP TRIGGER IF EXISTS repechaje_picks_validate_before ON public.revancha_picks;
DROP FUNCTION IF EXISTS public.repechaje_picks_validate();

CREATE FUNCTION public.revancha_picks_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text; oldv jsonb;
  is_admin boolean;
BEGIN
  is_admin := public.has_role(auth.uid(),'admin');

  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches,'{}'::jsonb)) LOOP
    IF public._gp_score_invalid(NEW.extra_matches->k) THEN
      RAISE EXCEPTION 'Marcador inválido en el partido %: usa un solo dígito (0–9) en ambos campos.', k;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tournament_state ts, jsonb_array_elements(COALESCE(ts.extra_matches,'[]'::jsonb)) m
      WHERE ts.id = 1 AND m->>'id' = k AND m->>'fase' IN ('semis','final')
    ) THEN
      RAISE EXCEPTION 'El partido % no es de semis ni de la final — la revancha solo pronostica esas dos rondas.', k;
    END IF;
  END LOOP;

  IF NOT is_admin AND TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(COALESCE(OLD.extra_matches,'{}'::jsonb)) LOOP
      oldv := OLD.extra_matches->k;
      IF (oldv->>'gh') IS NOT NULL AND (NEW.extra_matches->k->>'gh') IS DISTINCT FROM (oldv->>'gh') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
      IF (oldv->>'ga') IS NOT NULL AND (NEW.extra_matches->k->>'ga') IS DISTINCT FROM (oldv->>'ga') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.revancha_picks_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revancha_picks_validate() TO service_role;

CREATE TRIGGER revancha_picks_validate_before
  BEFORE INSERT OR UPDATE ON public.revancha_picks
  FOR EACH ROW EXECUTE FUNCTION public.revancha_picks_validate();

-- ============================================================================
-- 4) Candado de tiempo — mismo cuerpo que enforce_repechaje_deadline, nombre nuevo (y sus
--    dos triggers BEFORE INSERT / BEFORE UPDATE OF extra_matches, la lección del hallazgo #20
--    sigue intacta: NUNCA un BEFORE UPDATE a secas).
-- ============================================================================
DROP TRIGGER IF EXISTS repechaje_picks_enforce_deadline_insert ON public.revancha_picks;
DROP TRIGGER IF EXISTS repechaje_picks_enforce_deadline_predicciones ON public.revancha_picks;
DROP FUNCTION IF EXISTS public.enforce_repechaje_deadline();

CREATE FUNCTION public.enforce_revancha_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_abierta boolean;
  v_lock timestamptz;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN
    RETURN NEW;
  END IF;
  SELECT revancha_abierta, revancha_locked_at INTO v_abierta, v_lock
    FROM public.tournament_state WHERE id = 1;
  IF NOT COALESCE(v_abierta, false) THEN
    RAISE EXCEPTION 'La revancha todavía no está abierta.';
  END IF;
  IF v_lock IS NOT NULL AND now() >= v_lock THEN
    RAISE EXCEPTION 'La revancha está cerrada. Habla con el admin si necesitas un cambio.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_revancha_deadline() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER revancha_picks_enforce_deadline_insert
  BEFORE INSERT ON public.revancha_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_revancha_deadline();

CREATE TRIGGER revancha_picks_enforce_deadline_predicciones
  BEFORE UPDATE OF extra_matches ON public.revancha_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_revancha_deadline();

-- ============================================================================
-- 5) updated_at — la función genérica update_updated_at_column() es compartida (sin
--    "repechaje" en el nombre, no se toca); solo el trigger cambia de nombre.
-- ============================================================================
DROP TRIGGER IF EXISTS repechaje_picks_updated_at ON public.revancha_picks;
CREATE TRIGGER revancha_picks_updated_at
  BEFORE UPDATE OF extra_matches ON public.revancha_picks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6) Puntuación — calc_revancha_points, mismo cuerpo, sigue usando _match_pts (sin
--    "repechaje"/"revancha" en el nombre, función compartida, no se toca).
-- ============================================================================
DROP FUNCTION IF EXISTS public.calc_repechaje_points(uuid);

CREATE FUNCTION public.calc_revancha_points(_participant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record; p record; match_o jsonb; pts int;
  pts_total int := 0; c5 int := 0; c3 int := 0; c2 int := 0;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.revancha_picks WHERE participant_id = _participant_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  FOR match_o IN SELECT jsonb_array_elements(COALESCE(s.extra_matches, '[]'::jsonb)) LOOP
    IF match_o->>'fase' NOT IN ('semis','final') THEN CONTINUE; END IF;
    pts := public._match_pts(match_o, p.extra_matches -> (match_o->>'id'));
    IF pts IS NULL THEN CONTINUE; END IF;
    pts_total := pts_total + pts;
    IF pts = 5 THEN c5 := c5 + 1;
    ELSIF pts = 3 THEN c3 := c3 + 1;
    ELSIF pts = 2 THEN c2 := c2 + 1;
    END IF;
  END LOOP;

  UPDATE public.revancha_picks SET
    puntos = pts_total, aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _participant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calc_revancha_points(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 7) get_revancha_leaderboard — mismo cuerpo/desempate 5→3→2 que get_repechaje_leaderboard,
--    apuntando a revancha_picks/estado_pago_revancha. get_polla_leaderboard() no se toca: no
--    tiene "repechaje" en su definición, solo en_polla_original (que no se renombra).
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_repechaje_leaderboard();

CREATE FUNCTION public.get_revancha_leaderboard()
 RETURNS TABLE(participant_id uuid, nombre text, puntos int, aciertos_5 int, aciertos_3 int, aciertos_2 int, posicion bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    pa.id, pa.nombre,
    COALESCE(rp.puntos, 0),
    COALESCE(rp.aciertos_5, 0),
    COALESCE(rp.aciertos_3, 0),
    COALESCE(rp.aciertos_2, 0),
    RANK() OVER (ORDER BY
      COALESCE(rp.puntos,0) DESC,
      COALESCE(rp.aciertos_5,0) DESC,
      COALESCE(rp.aciertos_3,0) DESC,
      COALESCE(rp.aciertos_2,0) DESC)
  FROM public.participants pa
  LEFT JOIN public.revancha_picks rp ON rp.participant_id = pa.id
  WHERE pa.estado_pago_revancha = 'aprobado'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = pa.user_id AND ur.role = 'admin'
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_revancha_leaderboard() TO anon, authenticated, service_role;

-- ============================================================
-- 20260727000000_revancha_recalc_y_cuota.sql
-- ============================================================
-- Cierra el esquema de La Revancha: recálculo automático + cuota configurable. Sin UI
-- (viene en la tarea siguiente) — solo esquema.
--
-- ============================================================================
-- 1) CANDADO — verificado, no se toca.
-- ============================================================================
-- El candado de revancha_picks ya es correcto desde el esquema original
-- (20260725000000_repechaje_schema.sql, preservado en el rename): confirmado en vivo
-- contra pg_trigger antes de escribir esta migración —
--   revancha_picks_enforce_deadline_predicciones: BEFORE UPDATE OF extra_matches
-- no un BEFORE UPDATE a secas. Un UPDATE de solo puntaje (lo que hace
-- calc_revancha_points) nunca lo dispara. Nada que arreglar acá.
--
-- ============================================================================
-- 2) RECÁLCULO AUTOMÁTICO — trigger HERMANO, no extender ts_recalc_on_official_change.
-- ============================================================================
-- Por qué trigger hermano y no extender la función existente: el aislamiento (que un
-- fallo en La Revancha no aborte el recálculo de la polla principal) exige de todos
-- modos un bloque BEGIN/EXCEPTION propio alrededor de la parte de Revancha — eso ya da
-- el aislamiento, sea cual sea la función donde viva. Dado que el aislamiento no
-- depende de dónde vive el código, prefiero NO tocar ts_recalc_on_official_change (la
-- función de recálculo de la polla principal, ya auditada, con dinero real detrás) por
-- una ganancia que sería puramente organizativa. Mismo criterio que _match_pts vs
-- calc_pick_points en 20260725000000_repechaje_schema.sql: cuando una alternativa
-- puramente aditiva es igual de correcta, se prefiere no tocar lo crítico ya probado.
--
-- Orden garantizado SIN coordinación explícita: Postgres dispara los triggers AFTER
-- UPDATE de una misma fila en orden alfabético de nombre. "ts_recalc_on_official_change"
-- < "ts_recalc_revancha_on_official_change" (la 'o' de "on" ordena antes que la 'r' de
-- "revancha") — el recálculo de la polla principal SIEMPRE corre primero. La polla
-- original manda.
--
-- OJO: ese orden es DEFENSIVO, no lo que PROTEGE a la polla principal — es solo una
-- garantía extra de secuencia, no el mecanismo de aislamiento. Lo que de verdad impide
-- que un fallo en Revancha contamine a la polla principal es el BEGIN/EXCEPTION de más
-- abajo: aunque este trigger corriera ANTES por cualquier motivo (alguien lo renombra
-- mañana y el orden alfabético cambia en silencio), un fallo ahí seguiría sin poder
-- abortar nada fuera de su propio bloque. No confiar en el orden como si fuera la
-- protección — confiar en el BEGIN/EXCEPTION.
--
-- Alcance del trigger: solo extra_matches (Revancha no depende de groups/
-- group_k_matches/goleador_id/arquero_id — calc_revancha_points ya filtra fase IN
-- ('semis','final') internamente). Evita recálculos de Revancha en cada guardado de
-- fase de grupos, a diferencia del trigger de la polla principal que sí necesita
-- escuchar las 5 columnas.
--
-- Aislamiento: el loop de calc_revancha_points va en un BEGIN/EXCEPTION propio. Si
-- explota por CUALQUIER razón (dato corrupto, bug, lo que sea), se atrapa, se deja un
-- WARNING en el log (visible en Supabase → Logs, para que el admin no quede a ciegas) y
-- la función retorna normalmente — la transacción que disparó esto (el UPDATE de
-- tournament_state, y con él el recálculo de la polla principal que ya corrió en el
-- trigger hermano anterior) sigue su curso sin abortar.
CREATE OR REPLACE FUNCTION public.ts_recalc_revancha_on_official_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  BEGIN
    FOR r IN SELECT participant_id FROM public.revancha_picks LOOP
      PERFORM public.calc_revancha_points(r.participant_id);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Recálculo de La Revancha falló (no afecta a la polla principal): %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ts_recalc_revancha_on_official_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ts_recalc_revancha_on_official_change ON public.tournament_state;
CREATE TRIGGER ts_recalc_revancha_on_official_change
AFTER UPDATE OF extra_matches ON public.tournament_state
FOR EACH ROW
WHEN (NEW.extra_matches IS DISTINCT FROM OLD.extra_matches)
EXECUTE FUNCTION public.ts_recalc_revancha_on_official_change();

-- ============================================================================
-- 3) REPORTE — función propia, no se extiende recalc_all_picks_report().
-- ============================================================================
-- Por qué propia y no extender el reporte existente: recalc_all_picks_report() es
-- ADMIN-ONLY y alimenta el toast de ResultadosTab (recalcToastPlan() en el cliente,
-- que parsea participantes/partidos_omitidos/grupos_omitidos de ESE jsonb específico
-- para la polla principal). Mezclar los datos de Revancha ahí adentro acoplaría dos
-- competencias que el resto de este esquema se cuidó de mantener separadas (las dos
-- guardas del punto 1 de la tarea anterior existen justo para esto), y cualquier UI
-- futura para Revancha tendría que desarmar un jsonb compartido en vez de llamar a su
-- propia función. recalc_revancha_report() es la contraparte de
-- recalc_all_picks_report(): mismo contrato (jsonb, admin-only, sin guard duro de
-- datos), lista para que la UI de Revancha (tarea siguiente) la llame directo.
CREATE OR REPLACE FUNCTION public.recalc_revancha_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record; n int := 0;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  FOR r IN SELECT participant_id FROM public.revancha_picks LOOP
    PERFORM public.calc_revancha_points(r.participant_id);
    n := n + 1;
  END LOOP;

  RETURN jsonb_build_object('participantes', n);
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_revancha_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_revancha_report() TO authenticated, service_role;

-- ============================================================================
-- 4) CUOTA CONFIGURABLE — tournament_state.revancha_cuota_cop, NO hardcodeada en TS.
-- ============================================================================
-- Cómo vive la cuota de la polla ORIGINAL hoy: tournament_state.cuota_cop es una
-- columna NOT NULL DEFAULT 100000 que existe desde el esquema original — pero
-- src/lib/polla.ts define un POLLA.cuotaCOP = 100_000 hardcodeado en TS, y es ESE
-- constante el que usa toda la UI (index.tsx, dashboard.tsx, reglas.tsx,
-- AboutSection.tsx, tabs.tsx) — tournament_state.cuota_cop existe en la BD pero
-- ningún código lo lee. Es la "mala solución" que la tarea pidió no copiar: la columna
-- configurable ya estaba construida a medias y nunca se conectó.
--
-- Para La Revancha, la cuota SÍ vive donde debe: tournament_state.revancha_cuota_cop,
-- mismo patrón que cuota_cop (columna, no constante), consistente con el resto de
-- config de Revancha ya en esta tabla (revancha_abierta, revancha_locked_at). El admin
-- la cambia con un UPDATE normal (mismo camino que ya usa para picks_locked_at) — sin
-- tocar código ni migraciones. Default 50.000 (semis + final juntas, la mitad de la
-- cuota original), el valor de referencia de la tarea.
--
-- Fuera de alcance de esta migración (explícitamente: "aquí nada de pantallas"): que
-- el código TS realmente LEA esta columna en vez de un futuro POLLA.revanchaCuotaCOP
-- hardcodeado. Eso es trabajo de UI — la tarea que construya el alta/pago de Revancha
-- debería, de paso, corregir también el mismo problema en la cuota ORIGINAL
-- (cuota_cop), ya que a esa altura se estará tocando ese mismo código de todas formas.
ALTER TABLE public.tournament_state
  ADD COLUMN revancha_cuota_cop integer NOT NULL DEFAULT 50000;
