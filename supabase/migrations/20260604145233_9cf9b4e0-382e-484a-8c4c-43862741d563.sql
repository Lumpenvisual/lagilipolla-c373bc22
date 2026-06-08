
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
