-- Alinear calc_pick_points con el reglamento oficial:
--  5 = marcador exacto
--  3 = mismo ganador + acierta cantidad de goles de cualquier equipo
--  2 = mismo ganador (sin importar goles), no aplica a empate
--  1 = empate-empate (no exacto)
--  1 = acierta cantidad de goles de un equipo (sin importar resultado)
--  0 = nada
CREATE OR REPLACE FUNCTION public.calc_pick_points(_pick_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Groups (sin cambios)
  FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
    gobj := s.groups->k;
    pos1_o := gobj->>'pos1';
    pos2_o := gobj->>'pos2';
    pos1_p := (p.groups->k)->>'pos1';
    pos2_p := (p.groups->k)->>'pos2';
    IF pos1_o IS NULL OR pos2_o IS NULL OR pos1_p IS NULL OR pos2_p IS NULL THEN CONTINUE; END IF;
    IF pos1_p = pos1_o AND pos2_p = pos2_o THEN
      pts_g := pts_g + 5;
    ELSIF pos1_p = pos2_o AND pos2_p = pos1_o THEN
      pts_g := pts_g + 3;
    ELSIF pos1_p = pos1_o OR pos1_p = pos2_o OR pos2_p = pos1_o OR pos2_p = pos2_o THEN
      pts_g := pts_g + 1;
    END IF;
  END LOOP;

  -- Marcadores (reglamento oficial)
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
      pts_m := pts_m + 5;                                   -- exacto
    ELSIF sign_o <> 0 AND sign_p = sign_o THEN
      IF ph = oh OR pa = oa THEN
        pts_m := pts_m + 3;                                 -- ganador + goles de un equipo
      ELSE
        pts_m := pts_m + 2;                                 -- solo ganador
      END IF;
    ELSIF sign_o = 0 AND sign_p = 0 THEN
      pts_m := pts_m + 1;                                   -- empate-empate (no exacto)
    ELSIF ph = oh OR pa = oa THEN
      pts_m := pts_m + 1;                                   -- goles de un equipo
    END IF;
  END LOOP;

  -- Especiales (sin cambios)
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
$function$;

-- Mantener revocación de EXECUTE (helper interno)
REVOKE EXECUTE ON FUNCTION public.calc_pick_points(uuid) FROM PUBLIC, anon, authenticated;
