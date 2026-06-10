-- AUTO-GENERATED snapshot · 2026-06-10T22:38:08Z
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
