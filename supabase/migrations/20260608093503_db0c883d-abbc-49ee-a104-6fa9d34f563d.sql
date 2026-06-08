
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
