
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
