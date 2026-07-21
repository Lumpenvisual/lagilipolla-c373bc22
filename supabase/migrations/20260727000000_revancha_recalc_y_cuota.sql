-- Cierra el esquema de La Revancha: recálculo automático + cuota configurable. Sin UI
-- (viene en la tarea siguiente) — solo esquema.
--
-- ============================================================================
-- 1) CANDADO — verificado, no se toca.
-- ============================================================================
-- El candado de revancha_picks ya es correcto desde el esquema original
-- (20260725000000_repechaje_schema.sql, preservado en el rename): confirmado en vivo
-- contra pg_trigger antes de escribir esta migración —
--   revancha_picks_enforce_deadline_predicciones: BEFORE UPDATE OF extra_matches
-- no un BEFORE UPDATE a secas. Un UPDATE de solo puntaje (lo que hace
-- calc_revancha_points) nunca lo dispara. Nada que arreglar acá.
--
-- ============================================================================
-- 2) RECÁLCULO AUTOMÁTICO — trigger HERMANO, no extender ts_recalc_on_official_change.
-- ============================================================================
-- Por qué trigger hermano y no extender la función existente: el aislamiento (que un
-- fallo en La Revancha no aborte el recálculo de la polla principal) exige de todos
-- modos un bloque BEGIN/EXCEPTION propio alrededor de la parte de Revancha — eso ya da
-- el aislamiento, sea cual sea la función donde viva. Dado que el aislamiento no
-- depende de dónde vive el código, prefiero NO tocar ts_recalc_on_official_change (la
-- función de recálculo de la polla principal, ya auditada, con dinero real detrás) por
-- una ganancia que sería puramente organizativa. Mismo criterio que _match_pts vs
-- calc_pick_points en 20260725000000_repechaje_schema.sql: cuando una alternativa
-- puramente aditiva es igual de correcta, se prefiere no tocar lo crítico ya probado.
--
-- Orden garantizado SIN coordinación explícita: Postgres dispara los triggers AFTER
-- UPDATE de una misma fila en orden alfabético de nombre. "ts_recalc_on_official_change"
-- < "ts_recalc_revancha_on_official_change" (la 'o' de "on" ordena antes que la 'r' de
-- "revancha") — el recálculo de la polla principal SIEMPRE corre primero. La polla
-- original manda.
--
-- OJO: ese orden es DEFENSIVO, no lo que PROTEGE a la polla principal — es solo una
-- garantía extra de secuencia, no el mecanismo de aislamiento. Lo que de verdad impide
-- que un fallo en Revancha contamine a la polla principal es el BEGIN/EXCEPTION de más
-- abajo: aunque este trigger corriera ANTES por cualquier motivo (alguien lo renombra
-- mañana y el orden alfabético cambia en silencio), un fallo ahí seguiría sin poder
-- abortar nada fuera de su propio bloque. No confiar en el orden como si fuera la
-- protección — confiar en el BEGIN/EXCEPTION.
--
-- Alcance del trigger: solo extra_matches (Revancha no depende de groups/
-- group_k_matches/goleador_id/arquero_id — calc_revancha_points ya filtra fase IN
-- ('semis','final') internamente). Evita recálculos de Revancha en cada guardado de
-- fase de grupos, a diferencia del trigger de la polla principal que sí necesita
-- escuchar las 5 columnas.
--
-- Aislamiento: el loop de calc_revancha_points va en un BEGIN/EXCEPTION propio. Si
-- explota por CUALQUIER razón (dato corrupto, bug, lo que sea), se atrapa, se deja un
-- WARNING en el log (visible en Supabase → Logs, para que el admin no quede a ciegas) y
-- la función retorna normalmente — la transacción que disparó esto (el UPDATE de
-- tournament_state, y con él el recálculo de la polla principal que ya corrió en el
-- trigger hermano anterior) sigue su curso sin abortar.
CREATE OR REPLACE FUNCTION public.ts_recalc_revancha_on_official_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  BEGIN
    FOR r IN SELECT participant_id FROM public.revancha_picks LOOP
      PERFORM public.calc_revancha_points(r.participant_id);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Recálculo de La Revancha falló (no afecta a la polla principal): %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ts_recalc_revancha_on_official_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ts_recalc_revancha_on_official_change ON public.tournament_state;
CREATE TRIGGER ts_recalc_revancha_on_official_change
AFTER UPDATE OF extra_matches ON public.tournament_state
FOR EACH ROW
WHEN (NEW.extra_matches IS DISTINCT FROM OLD.extra_matches)
EXECUTE FUNCTION public.ts_recalc_revancha_on_official_change();

-- ============================================================================
-- 3) REPORTE — función propia, no se extiende recalc_all_picks_report().
-- ============================================================================
-- Por qué propia y no extender el reporte existente: recalc_all_picks_report() es
-- ADMIN-ONLY y alimenta el toast de ResultadosTab (recalcToastPlan() en el cliente,
-- que parsea participantes/partidos_omitidos/grupos_omitidos de ESE jsonb específico
-- para la polla principal). Mezclar los datos de Revancha ahí adentro acoplaría dos
-- competencias que el resto de este esquema se cuidó de mantener separadas (las dos
-- guardas del punto 1 de la tarea anterior existen justo para esto), y cualquier UI
-- futura para Revancha tendría que desarmar un jsonb compartido en vez de llamar a su
-- propia función. recalc_revancha_report() es la contraparte de
-- recalc_all_picks_report(): mismo contrato (jsonb, admin-only, sin guard duro de
-- datos), lista para que la UI de Revancha (tarea siguiente) la llame directo.
CREATE OR REPLACE FUNCTION public.recalc_revancha_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record; n int := 0;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  FOR r IN SELECT participant_id FROM public.revancha_picks LOOP
    PERFORM public.calc_revancha_points(r.participant_id);
    n := n + 1;
  END LOOP;

  RETURN jsonb_build_object('participantes', n);
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_revancha_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_revancha_report() TO authenticated, service_role;

-- ============================================================================
-- 4) CUOTA CONFIGURABLE — tournament_state.revancha_cuota_cop, NO hardcodeada en TS.
-- ============================================================================
-- Cómo vive la cuota de la polla ORIGINAL hoy: tournament_state.cuota_cop es una
-- columna NOT NULL DEFAULT 100000 que existe desde el esquema original — pero
-- src/lib/polla.ts define un POLLA.cuotaCOP = 100_000 hardcodeado en TS, y es ESE
-- constante el que usa toda la UI (index.tsx, dashboard.tsx, reglas.tsx,
-- AboutSection.tsx, tabs.tsx) — tournament_state.cuota_cop existe en la BD pero
-- ningún código lo lee. Es la "mala solución" que la tarea pidió no copiar: la columna
-- configurable ya estaba construida a medias y nunca se conectó.
--
-- Para La Revancha, la cuota SÍ vive donde debe: tournament_state.revancha_cuota_cop,
-- mismo patrón que cuota_cop (columna, no constante), consistente con el resto de
-- config de Revancha ya en esta tabla (revancha_abierta, revancha_locked_at). El admin
-- la cambia con un UPDATE normal (mismo camino que ya usa para picks_locked_at) — sin
-- tocar código ni migraciones. Default 50.000 (semis + final juntas, la mitad de la
-- cuota original), el valor de referencia de la tarea.
--
-- Fuera de alcance de esta migración (explícitamente: "aquí nada de pantallas"): que
-- el código TS realmente LEA esta columna en vez de un futuro POLLA.revanchaCuotaCOP
-- hardcodeado. Eso es trabajo de UI — la tarea que construya el alta/pago de Revancha
-- debería, de paso, corregir también el mismo problema en la cuota ORIGINAL
-- (cuota_cop), ya que a esa altura se estará tocando ese mismo código de todas formas.
ALTER TABLE public.tournament_state
  ADD COLUMN revancha_cuota_cop integer NOT NULL DEFAULT 50000;
