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
