-- Plazo de eliminatorias POR RONDA (no por-partido).
--
-- Cambio de reglamento (solo eliminatorias): la planilla de una ronda KO se cierra para
-- los participantes 1 HORA antes del PRIMER partido de esa ronda/fase (dieciseisavos,
-- octavos, cuartos, semis, tercero, final). Antes era 24 h por partido.
--
-- - Grupos (group_k_matches): SIN CAMBIOS, sigue el candado de 24 h por partido (is_match_locked).
-- - Admin: conserva su bypass total (cierre global + por-ronda), como hasta ahora.
-- - Si una fase aún no tiene fechas cargadas, NO bloquea (la ronda queda abierta hasta que
--   el admin programe en Cronograma).

-- 1. ¿Está cerrada la RONDA que contiene este partido de eliminatorias?
--    true si now() >= (primer fecha de la fase) - 1 hora.
CREATE OR REPLACE FUNCTION public.is_extra_phase_locked(_match_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    now() >= MIN(NULLIF(m->>'fecha', '')::timestamptz) - interval '1 hour',
    false
  )
  FROM public.tournament_state ts,
       jsonb_array_elements(COALESCE(ts.extra_matches, '[]'::jsonb)) AS m
  WHERE ts.id = 1
    AND m->>'fase' = (
      SELECT m2->>'fase'
      FROM public.tournament_state ts2,
           jsonb_array_elements(COALESCE(ts2.extra_matches, '[]'::jsonb)) AS m2
      WHERE ts2.id = 1 AND m2->>'id' = _match_id
      LIMIT 1
    );
$function$;

-- 2. enforce_picks_deadline: el bucle de extra_matches pasa a candado POR-RONDA.
--    (basado en 20260616120000_admin_bypass_match_lock.sql; group_k_matches sin cambios)
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
  -- Cierre global: el admin lo salta.
  IF NOT public.has_role(auth.uid(),'admin') THEN
    SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
    IF v_lock IS NOT NULL AND now() >= v_lock THEN
      RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
    END IF;
  END IF;

  -- Bloqueos por tiempo: el admin también los salta.
  IF (TG_OP = 'UPDATE' OR TG_OP = 'INSERT') AND NOT public.has_role(auth.uid(),'admin') THEN
    -- Grupo K: candado por-partido (24 h antes del kickoff).
    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches, '{}'::jsonb)) LOOP
      v_new := NEW.group_k_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.group_k_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;

    -- Eliminatorias: candado por-RONDA (1 h antes del primer partido de la fase).
    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches, '{}'::jsonb)) LOOP
      v_new := NEW.extra_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.extra_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_extra_phase_locked(v_key) THEN
        RAISE EXCEPTION 'Esta ronda de eliminatorias está cerrada: empezó (o está por empezar) su primer partido.';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
