-- Esquema para el "Repechaje": competencia de segunda oportunidad (semis + final, 5/3/2/1/0)
-- 100% separada de la polla original — tabla y pozo propios, abierta a cualquiera, pago
-- propio que aprueba el admin, sin cálculo de premios en la app (eso lo reparte el admin
-- fuera de la app). Solo esquema — sin UI todavía.
--
-- OJO DE NOMBRE — colisión con un concepto YA EXISTENTE: "Repechaje/Repechajes" en este
-- código ya significa otra cosa — la resolución de los 6 cupos de clasificación FIFA
-- (admin.t.res.repechajes en tabs.tsx/translations.ts, "Ganador Repechaje X" en Cronograma,
-- y la nota de ScoringRulesPanel sobre alargue/penales). Es una coincidencia de nombre, no
-- de concepto: uno es "cómo un equipo llegó al Mundial", el otro es "una segunda polla sobre
-- semis/final". No resuelto aquí (es una decisión de producto, no de esquema) — cualquiera
-- que grep "repechaje" en el futuro va a mezclar ambos, tenlo presente.
--
-- ============================================================================
-- 1) DOS GUARDAS INDEPENDIENTES para que un inscrito solo-repechaje jamás aparezca en la
--    tabla principal (get_polla_leaderboard):
--
--    Guarda A (ya existía, accidental): estado_pago = 'aprobado'.
--    Guarda B (nueva, explícita):       en_polla_original = true.
--
--    Por qué DOS y no una convención: la guarda A depende de que nadie apruebe por error el
--    pago PRINCIPAL de alguien que solo pagó repechaje — el error humano de un bar lleno un
--    sábado, dos filas de pago con el mismo participante delante. Con la guarda B, ese error
--    de un solo campo (estado_pago) ya no basta: hace falta ADEMÁS que alguien ponga
--    en_polla_original = true, una acción separada, en un campo que ninguna pantalla de
--    aprobación de pago va a tocar por accidente (no existe ningún flujo que lo setee salvo
--    el admin explícitamente, o este backfill).
--
--    Alternativa descartada: una tabla `repechaje_participants` separada en vez de reusar
--    `participants`. Reusar participants mantiene el login alias+PIN (auth.users/
--    participants.user_id) sin duplicar auth.
--
-- ============================================================================
-- 2) participants: las dos columnas nuevas.
--
--    en_polla_original boolean NOT NULL DEFAULT false — fail-closed a propósito: cualquier
--    fila NUEVA (un futuro alta solo-repechaje) nace FUERA de la tabla principal salvo que
--    alguien la marque explícitamente. Los 41 participants actuales (37 aprobados + 4
--    rechazados) se marcan true en este backfill — TODOS, no solo los 37 aprobados: esta
--    columna trackea de qué COHORTE viene la fila (¿pasó por el alta de la polla original?),
--    no si terminó aprobada. Un rechazado de la polla original sigue siendo, legítimamente,
--    alguien "de la polla original" — si el admin corrige su estado_pago más adelante (un
--    error de aprobación, no de bucket), debe poder aparecer en la principal exactamente
--    igual que cualquier otro aprobado. Lo que la guarda B existe para impedir es la otra
--    dirección: que alguien que NUNCA pasó por ahí (solo-repechaje) se cuele.
--
--    estado_pago_repechaje text NULLABLE, mismo CHECK de valores que estado_pago
--    ('pendiente'/'aprobado'/'rechazado') — NULL para los 41 actuales (no se inscribieron a
--    esto, no existía). NULL es intencional y distinto de 'pendiente': "nunca aplicó" vs
--    "aplicó, en espera". El CHECK con IN(...) ya permite NULL de forma nativa en Postgres.
--
--    INSERT policy: se agrega `AND en_polla_original = false` al WITH CHECK de
--    participants_own_insert, en el mismo espíritu que el `AND estado_pago = 'pendiente'`
--    que ya tenía — un alta propia (self-signup) nunca puede marcarse a sí misma como ya
--    perteneciente a la polla original. Solo el admin (participants_admin_all, FOR ALL) puede
--    tocar esta columna después del insert — y no hay ninguna policy own_update en
--    participants hoy, así que ya está cerrado por diseño para no-admins.

ALTER TABLE public.participants
  ADD COLUMN en_polla_original boolean NOT NULL DEFAULT false,
  ADD COLUMN estado_pago_repechaje text
    CHECK (estado_pago_repechaje IN ('pendiente','aprobado','rechazado'));

UPDATE public.participants SET en_polla_original = true;

DROP POLICY IF EXISTS "participants_own_insert" ON public.participants;
CREATE POLICY "participants_own_insert" ON public.participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND estado_pago = 'pendiente' AND en_polla_original = false);

-- ============================================================================
-- 3) tournament_state: candado propio del repechaje.
--
--    repechaje_abierto boolean NOT NULL DEFAULT false — flag manual (no una fecha calculada):
--    el admin lo prende al llegar a cuartos, igual de estilo que los toggles de fase/
--    visibilidad que ya existen en Cronograma. Arranca cerrado: nadie puede inscribirse ni
--    guardar picks de repechaje hasta que el admin decida que es momento.
--
--    repechaje_locked_at timestamptz NOT NULL DEFAULT — mismo patrón que picks_locked_at
--    (NOT NULL, con un valor real, no un placeholder vacío): 1h antes del primer partido de
--    semis (m101, 2026-07-14T15:00:00-04:00), el mismo margen que ya usa el candado por-ronda
--    de eliminatorias (is_extra_phase_locked). El admin puede recorrerlo más adelante si
--    hace falta, exactamente como ya hace con picks_locked_at.

ALTER TABLE public.tournament_state
  ADD COLUMN repechaje_abierto boolean NOT NULL DEFAULT false,
  ADD COLUMN repechaje_locked_at timestamptz NOT NULL DEFAULT '2026-07-14T14:00:00-04:00';

-- ============================================================================
-- 4) repechaje_picks — misma forma que picks, pero solo con lo que el repechaje necesita:
--    sin groups/group_k_matches/goleador_id/arquero_id (el repechaje no puntúa nada de eso).
--    puntos NO es una columna generada (a diferencia de picks.puntos_total, que suma 3
--    categorías): el repechaje solo tiene una, así que es un entero plano que escribe
--    calc_repechaje_points.

CREATE TABLE public.repechaje_picks (
  participant_id uuid PRIMARY KEY REFERENCES public.participants(id) ON DELETE CASCADE,
  extra_matches jsonb NOT NULL DEFAULT '{}'::jsonb,
  puntos integer NOT NULL DEFAULT 0,
  aciertos_5 integer NOT NULL DEFAULT 0,
  aciertos_3 integer NOT NULL DEFAULT 0,
  aciertos_2 integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repechaje_picks TO authenticated;
GRANT ALL ON public.repechaje_picks TO service_role;
ALTER TABLE public.repechaje_picks ENABLE ROW LEVEL SECURITY;

-- Mismas policies que picks (own_read/own_insert/own_update/admin_all), pero el gate de
-- "aprobado" mira estado_pago_repechaje, NO estado_pago — la aprobación de una competencia
-- no debe habilitar la otra. A diferencia de picks_own_update (que además revisa
-- tournament_state.deadline, un mecanismo paralelo al trigger enforce_picks_deadline y con
-- pinta de resabio histórico), el candado de tiempo del repechaje vive SOLO en el trigger de
-- abajo — un único mecanismo, no dos que puedan desalinearse.
CREATE POLICY "repechaje_picks_own_read" ON public.repechaje_picks
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = participant_id AND p.user_id = auth.uid())
  );

CREATE POLICY "repechaje_picks_own_insert" ON public.repechaje_picks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid() AND p.estado_pago_repechaje = 'aprobado'
    )
  );

CREATE POLICY "repechaje_picks_own_update" ON public.repechaje_picks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid() AND p.estado_pago_repechaje = 'aprobado'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid() AND p.estado_pago_repechaje = 'aprobado'
    )
  );

CREATE POLICY "repechaje_picks_admin_all" ON public.repechaje_picks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- 4a) Validación: solo partidos de semis/final, marcador 0–9 completo o vacío,
--     inmutable para no-admin una vez guardado (mismo criterio que picks_validate,
--     BEFORE INSERT OR UPDATE sin restricción de columnas es seguro aquí por la misma razón
--     que en picks_validate: cada chequeo compara NEW vs OLD o NEW solo, así que en un
--     UPDATE de solo puntaje —extra_matches sin tocar— nunca dispara nada).
CREATE OR REPLACE FUNCTION public.repechaje_picks_validate()
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
      RAISE EXCEPTION 'El partido % no es de semis ni de la final — el repechaje solo pronostica esas dos rondas.', k;
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

REVOKE ALL ON FUNCTION public.repechaje_picks_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repechaje_picks_validate() TO service_role;

DROP TRIGGER IF EXISTS repechaje_picks_validate_before ON public.repechaje_picks;
CREATE TRIGGER repechaje_picks_validate_before
  BEFORE INSERT OR UPDATE ON public.repechaje_picks
  FOR EACH ROW EXECUTE FUNCTION public.repechaje_picks_validate();

-- ---------------------------------------------------------------------------
-- 4b) Candado de tiempo — LA LECCIÓN DEL HALLAZGO #20 aplicada desde el día uno (ver
--     20260722000000_deadline_solo_predicciones.sql): DOS triggers, no uno. Un solo
--     `BEFORE UPDATE` sin restricción de columnas dispararía con el UPDATE de SOLO PUNTAJE
--     que hace calc_repechaje_points — exactamente el bug que se arregló en `picks`,
--     reproducido en la primera noche que alguien recalcule sin sesión de admin
--     (Management API, script, o el propio trigger de recálculo si algún día se conecta uno
--     a tournament_state). BEFORE UPDATE OF extra_matches asegura que un UPDATE que solo
--     toca puntos/aciertos NUNCA pasa por este candado.
CREATE OR REPLACE FUNCTION public.enforce_repechaje_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_abierto boolean;
  v_lock timestamptz;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN
    RETURN NEW;
  END IF;
  SELECT repechaje_abierto, repechaje_locked_at INTO v_abierto, v_lock
    FROM public.tournament_state WHERE id = 1;
  IF NOT COALESCE(v_abierto, false) THEN
    RAISE EXCEPTION 'El repechaje todavía no está abierto.';
  END IF;
  IF v_lock IS NOT NULL AND now() >= v_lock THEN
    RAISE EXCEPTION 'El repechaje está cerrado. Habla con el admin si necesitas un cambio.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_repechaje_deadline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS repechaje_picks_enforce_deadline_insert ON public.repechaje_picks;
CREATE TRIGGER repechaje_picks_enforce_deadline_insert
  BEFORE INSERT ON public.repechaje_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_repechaje_deadline();

DROP TRIGGER IF EXISTS repechaje_picks_enforce_deadline_predicciones ON public.repechaje_picks;
CREATE TRIGGER repechaje_picks_enforce_deadline_predicciones
  BEFORE UPDATE OF extra_matches ON public.repechaje_picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_repechaje_deadline();

CREATE TRIGGER repechaje_picks_updated_at
  BEFORE UPDATE OF extra_matches ON public.repechaje_picks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 5) Puntuación: UN SOLO lugar para la regla de marcador (5/3/2/1/0), no una tercera copia.
--
--    calc_pick_points ya trae la regla ESCRITA DOS VECES adentro de sí misma (una para
--    group_k_matches, otra idéntica para extra_matches) — no es este cambio quien introduce
--    esa duplicación, ya estaba. Extraigo esa lógica a _match_pts(oficial, pick) → puntos,
--    como función NUEVA e independiente, y la uso desde calc_repechaje_points.
--    Deliberadamente NO toco calc_pick_points para que también la use: refactorizar la
--    función de puntuación más auditada y con más dinero real ya liquidado detrás (37
--    participantes, torneo cerrado) por una ganancia puramente cosmética de DRY es el tipo de
--    cambio de "cero beneficio, riesgo real" que no vale la pena — sobre todo cuando el
--    resultado de tocarla mal no es un error de compilación, es puntos mal calculados en un
--    torneo que ya terminó. Si se decide más adelante que vale la pena unificarlas, es un
--    cambio propio con su propio E2E completo contra los 37 picks reales.
--
--    _match_pts verificado exactamente equivalente a matchPts() (src/lib/polla.ts, ya
--    auditada contra calc_pick_points) en 16 900 combinaciones (oh,oa,ph,pa) — 100% de
--    coincidencia en el dominio donde ambas deben coincidir (oficial válido).
CREATE OR REPLACE FUNCTION public._match_pts(match_o jsonb, match_p jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  oh int; oa int; ph int; pa int;
  sign_o int; sign_p int;
BEGIN
  -- Oficial inválido o incompleto: este partido no puntúa para NADIE (NULL, no 0 — el
  -- llamador debe omitirlo de aciertos/pts, no sumarle un 0 que sí "cuenta" el partido).
  IF public._gp_score_invalid(match_o) THEN RETURN NULL; END IF;
  oh := NULLIF(match_o->>'gh','')::int;
  oa := NULLIF(match_o->>'ga','')::int;
  IF oh IS NULL OR oa IS NULL THEN RETURN NULL; END IF;

  -- Pick ausente/inválido/incompleto: el oficial SÍ es válido, así que el partido cuenta
  -- (0 puntos), a diferencia del caso anterior.
  IF match_p IS NULL OR public._gp_score_invalid(match_p) THEN RETURN 0; END IF;
  ph := NULLIF(match_p->>'gh','')::int;
  pa := NULLIF(match_p->>'ga','')::int;
  IF ph IS NULL OR pa IS NULL THEN RETURN 0; END IF;

  sign_o := sign(oh - oa);
  sign_p := sign(ph - pa);
  IF ph = oh AND pa = oa THEN RETURN 5; END IF;
  IF sign_o <> 0 AND sign_p = sign_o THEN
    IF ph = oh OR pa = oa THEN RETURN 3; ELSE RETURN 2; END IF;
  END IF;
  IF sign_o = 0 AND sign_p = 0 THEN RETURN 1; END IF;
  IF ph = oh OR pa = oa THEN RETURN 1; END IF;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public._match_pts(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._match_pts(jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.calc_repechaje_points(_participant_id uuid)
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
  SELECT * INTO p FROM public.repechaje_picks WHERE participant_id = _participant_id;
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

  UPDATE public.repechaje_picks SET
    puntos = pts_total, aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _participant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calc_repechaje_points(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6) Leaderboards: la principal gana la guarda B, el repechaje tiene la suya propia
--    (mismo desempate 5→3→2 que get_polla_leaderboard, sin premios ni reparto de pozo —
--    eso lo hace el admin fuera de la app, no se construye acá).

CREATE OR REPLACE FUNCTION public.get_polla_leaderboard()
 RETURNS TABLE(participant_id uuid, nombre text, puntos_grupos int, puntos_partidos int, puntos_especiales int, puntos_total int, aciertos_5 int, aciertos_3 int, aciertos_2 int, posicion bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    pa.id, pa.nombre,
    COALESCE(pk.puntos_grupos, 0),
    COALESCE(pk.puntos_partidos, 0),
    COALESCE(pk.puntos_especiales, 0),
    COALESCE(pk.puntos_total, 0),
    COALESCE(pk.aciertos_5, 0),
    COALESCE(pk.aciertos_3, 0),
    COALESCE(pk.aciertos_2, 0),
    RANK() OVER (ORDER BY
      COALESCE(pk.puntos_total,0) DESC,
      COALESCE(pk.aciertos_5,0) DESC,
      COALESCE(pk.aciertos_3,0) DESC,
      COALESCE(pk.aciertos_2,0) DESC)
  FROM public.participants pa
  LEFT JOIN public.picks pk ON pk.participant_id = pa.id
  WHERE pa.estado_pago = 'aprobado'
    AND pa.en_polla_original = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = pa.user_id AND ur.role = 'admin'
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_repechaje_leaderboard()
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
  LEFT JOIN public.repechaje_picks rp ON rp.participant_id = pa.id
  WHERE pa.estado_pago_repechaje = 'aprobado'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = pa.user_id AND ur.role = 'admin'
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_repechaje_leaderboard() TO anon, authenticated, service_role;

-- ============================================================================
-- PENDIENTE PARA CUANDO SE CONSTRUYA LA UI (fuera de alcance de esta migración):
--   - No hay recálculo automático al guardar semis/final: ts_recalc_on_official_change
--     (AFTER UPDATE en tournament_state) hoy solo dispara recalc_all_picks_internal(),
--     no calc_repechaje_points. Conectar eso es una decisión explícita de la próxima
--     tarea, no algo para colar aquí sin discutirlo.
--   - Ningún flujo de alta/pago/aprobación de repechaje existe todavía (ni en el admin ni
--     en el signup). Este archivo es solo el esquema que esos flujos van a necesitar.
