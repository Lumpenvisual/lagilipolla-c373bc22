-- Renombra "repechaje" → "REVANCHA" en todo lo que introdujo 20260725000000_repechaje_schema.sql
-- (tabla, columnas, funciones, triggers, políticas, constraints/índices auto-generados). Esa
-- migración NO se toca ni se reescribe — el historial debe reflejar la evolución real.
--
-- POR QUÉ: "repechaje" ya significa otra cosa en el reglamento oficial que los participantes
-- aceptaron — ScoringRulesPanel: "Si hay repechaje (alargue o penales), no cuenta". Se hace
-- AHORA porque es el momento más barato: cero filas en revancha_picks, cero UI construida,
-- nadie inscrito. La acepción de alargue/penales NO se toca (ScoringRulesPanel, reglas/, y
-- cualquier texto del reglamento siguen diciendo "repechaje" — es la legítima).
--
-- No se renombra participants.en_polla_original: no colisiona con nada y su nombre es bueno.
--
-- Cambio de nombre de columna al vuelo: tournament_state.repechaje_abierto -> revancha_abierta
-- (concordancia de género: "la revancha... abierta", no "repechaje_abierto" con "o" residual).

-- ============================================================================
-- 1) Tabla: rename + sus constraints/índice auto-generados (el RENAME TO de una tabla NO
--    renombra en cascada los nombres de PK/FK que Postgres generó con el nombre viejo).
-- ============================================================================
ALTER TABLE public.repechaje_picks RENAME TO revancha_picks;
ALTER TABLE public.revancha_picks RENAME CONSTRAINT repechaje_picks_pkey TO revancha_picks_pkey;
ALTER TABLE public.revancha_picks
  RENAME CONSTRAINT repechaje_picks_participant_id_fkey TO revancha_picks_participant_id_fkey;

-- Las 4 políticas RLS se quedan adjuntas a la tabla renombrada (Postgres las sigue por OID),
-- pero conservan su nombre viejo salvo que se renombren explícitamente.
ALTER POLICY "repechaje_picks_own_read" ON public.revancha_picks RENAME TO "revancha_picks_own_read";
ALTER POLICY "repechaje_picks_own_insert" ON public.revancha_picks RENAME TO "revancha_picks_own_insert";
ALTER POLICY "repechaje_picks_own_update" ON public.revancha_picks RENAME TO "revancha_picks_own_update";
ALTER POLICY "repechaje_picks_admin_all" ON public.revancha_picks RENAME TO "revancha_picks_admin_all";

-- ============================================================================
-- 2) Columnas.
-- ============================================================================
ALTER TABLE public.participants RENAME COLUMN estado_pago_repechaje TO estado_pago_revancha;
ALTER TABLE public.participants
  RENAME CONSTRAINT participants_estado_pago_repechaje_check TO participants_estado_pago_revancha_check;

ALTER TABLE public.tournament_state RENAME COLUMN repechaje_abierto TO revancha_abierta;
ALTER TABLE public.tournament_state RENAME COLUMN repechaje_locked_at TO revancha_locked_at;

-- ============================================================================
-- 3) Validación de revancha_picks — mismo cuerpo que repechaje_picks_validate, nombre nuevo.
--    DROP del trigger antes que la función (la función no se puede borrar mientras algo la
--    referencia), luego CREATE FUNCTION + CREATE TRIGGER con el nombre nuevo.
-- ============================================================================
DROP TRIGGER IF EXISTS repechaje_picks_validate_before ON public.revancha_picks;
DROP FUNCTION IF EXISTS public.repechaje_picks_validate();

CREATE FUNCTION public.revancha_picks_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text; oldv jsonb;
  is_admin boolean;
BEGIN
  is_admin := public.has_role(auth.uid(),'admin');

  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches,'{}'::jsonb)) LOOP
    IF public._gp_score_invalid(NEW.extra_matches->k) THEN
      RAISE EXCEPTION 'Marcador inválido en el partido %: usa un solo dígito (0–9) en ambos campos.', k;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tournament_state ts, jsonb_array_elements(COALESCE(ts.extra_matches,'[]'::jsonb)) m
      WHERE ts.id = 1 AND m->>'id' = k AND m->>'fase' IN ('semis','final')
    ) THEN
      RAISE EXCEPTION 'El partido % no es de semis ni de la final — la revancha solo pronostica esas dos rondas.', k;
    END IF;
  END LOOP;

  IF NOT is_admin AND TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(COALESCE(OLD.extra_matches,'{}'::jsonb)) LOOP
      oldv := OLD.extra_matches->k;
      IF (oldv->>'gh') IS NOT NULL AND (NEW.extra_matches->k->>'gh') IS DISTINCT FROM (oldv->>'gh') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
      IF (oldv->>'ga') IS NOT NULL AND (NEW.extra_matches->k->>'ga') IS DISTINCT FROM (oldv->>'ga') THEN
        RAISE EXCEPTION 'El marcador del partido % ya fue guardado y no se puede cambiar.', k;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.revancha_picks_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revancha_picks_validate() TO service_role;

CREATE TRIGGER revancha_picks_validate_before
  BEFORE INSERT OR UPDATE ON public.revancha_picks
  FOR EACH ROW EXECUTE FUNCTION public.revancha_picks_validate();

-- ============================================================================
-- 4) Candado de tiempo — mismo cuerpo que enforce_repechaje_deadline, nombre nuevo (y sus
--    dos triggers BEFORE INSERT / BEFORE UPDATE OF extra_matches, la lección del hallazgo #20
--    sigue intacta: NUNCA un BEFORE UPDATE a secas).
-- ============================================================================
DROP TRIGGER IF EXISTS repechaje_picks_enforce_deadline_insert ON public.revancha_picks;
DROP TRIGGER IF EXISTS repechaje_picks_enforce_deadline_predicciones ON public.revancha_picks;
DROP FUNCTION IF EXISTS public.enforce_repechaje_deadline();

CREATE FUNCTION public.enforce_revancha_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_abierta boolean;
  v_lock timestamptz;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN
    RETURN NEW;
  END IF;
  SELECT revancha_abierta, revancha_locked_at INTO v_abierta, v_lock
    FROM public.tournament_state WHERE id = 1;
  IF NOT COALESCE(v_abierta, false) THEN
    RAISE EXCEPTION 'La revancha todavía no está abierta.';
  END IF;
  IF v_lock IS NOT NULL AND now() >= v_lock THEN
    RAISE EXCEPTION 'La revancha está cerrada. Habla con el admin si necesitas un cambio.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_revancha_deadline() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER revancha_picks_enforce_deadline_insert
  BEFORE INSERT ON public.revancha_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_revancha_deadline();

CREATE TRIGGER revancha_picks_enforce_deadline_predicciones
  BEFORE UPDATE OF extra_matches ON public.revancha_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_revancha_deadline();

-- ============================================================================
-- 5) updated_at — la función genérica update_updated_at_column() es compartida (sin
--    "repechaje" en el nombre, no se toca); solo el trigger cambia de nombre.
-- ============================================================================
DROP TRIGGER IF EXISTS repechaje_picks_updated_at ON public.revancha_picks;
CREATE TRIGGER revancha_picks_updated_at
  BEFORE UPDATE OF extra_matches ON public.revancha_picks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6) Puntuación — calc_revancha_points, mismo cuerpo, sigue usando _match_pts (sin
--    "repechaje"/"revancha" en el nombre, función compartida, no se toca).
-- ============================================================================
DROP FUNCTION IF EXISTS public.calc_repechaje_points(uuid);

CREATE FUNCTION public.calc_revancha_points(_participant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record; p record; match_o jsonb; pts int;
  pts_total int := 0; c5 int := 0; c3 int := 0; c2 int := 0;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.revancha_picks WHERE participant_id = _participant_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  FOR match_o IN SELECT jsonb_array_elements(COALESCE(s.extra_matches, '[]'::jsonb)) LOOP
    IF match_o->>'fase' NOT IN ('semis','final') THEN CONTINUE; END IF;
    pts := public._match_pts(match_o, p.extra_matches -> (match_o->>'id'));
    IF pts IS NULL THEN CONTINUE; END IF;
    pts_total := pts_total + pts;
    IF pts = 5 THEN c5 := c5 + 1;
    ELSIF pts = 3 THEN c3 := c3 + 1;
    ELSIF pts = 2 THEN c2 := c2 + 1;
    END IF;
  END LOOP;

  UPDATE public.revancha_picks SET
    puntos = pts_total, aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _participant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calc_revancha_points(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 7) get_revancha_leaderboard — mismo cuerpo/desempate 5→3→2 que get_repechaje_leaderboard,
--    apuntando a revancha_picks/estado_pago_revancha. get_polla_leaderboard() no se toca: no
--    tiene "repechaje" en su definición, solo en_polla_original (que no se renombra).
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_repechaje_leaderboard();

CREATE FUNCTION public.get_revancha_leaderboard()
 RETURNS TABLE(participant_id uuid, nombre text, puntos int, aciertos_5 int, aciertos_3 int, aciertos_2 int, posicion bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    pa.id, pa.nombre,
    COALESCE(rp.puntos, 0),
    COALESCE(rp.aciertos_5, 0),
    COALESCE(rp.aciertos_3, 0),
    COALESCE(rp.aciertos_2, 0),
    RANK() OVER (ORDER BY
      COALESCE(rp.puntos,0) DESC,
      COALESCE(rp.aciertos_5,0) DESC,
      COALESCE(rp.aciertos_3,0) DESC,
      COALESCE(rp.aciertos_2,0) DESC)
  FROM public.participants pa
  LEFT JOIN public.revancha_picks rp ON rp.participant_id = pa.id
  WHERE pa.estado_pago_revancha = 'aprobado'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = pa.user_id AND ur.role = 'admin'
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_revancha_leaderboard() TO anon, authenticated, service_role;
