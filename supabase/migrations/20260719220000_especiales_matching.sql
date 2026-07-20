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
