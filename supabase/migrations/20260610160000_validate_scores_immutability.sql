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
