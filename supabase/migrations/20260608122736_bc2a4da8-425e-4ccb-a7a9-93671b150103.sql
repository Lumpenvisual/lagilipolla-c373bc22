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