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
