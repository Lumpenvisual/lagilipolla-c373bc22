-- PROPUESTA — NO APLICADA. Arregla el hallazgo: el candado de picks_locked_at bloquea
-- CUALQUIER recálculo (UPDATE de solo puntaje) hecho sin sesión de admin autenticada —
-- p. ej. cualquier migración/script vía Management API que dispare
-- ts_recalc_on_official_change, que encadena hasta calc_pick_points, que hace
-- `UPDATE public.picks SET puntos_grupos = ...`.
--
-- CAUSA: el único trigger de deadline vivo hoy, `picks_enforce_deadline`
-- (`BEFORE INSERT OR UPDATE ON picks`, sin restricción de columnas — ver
-- 20260625130000_knockout_phase_lock.sql), dispara con CUALQUIER UPDATE a `picks`,
-- incluido uno que solo toca puntos_grupos/puntos_partidos/puntos_especiales/
-- aciertos_5/aciertos_3/aciertos_2. Su check de "cierre global" no distingue qué
-- columnas cambian: solo mira `has_role(auth.uid(),'admin')` + `picks_locked_at`.
--
-- (NO hay trigger duplicado: `picks_deadline_trigger`, el nombre anterior, se creó el
-- 2026-06-08 y se eliminó explícitamente al día siguiente en
-- 20260609032317_1dbddfb4-b4b0-4b1b-a867-be37c0b73304.sql ("Drop duplicate deadline
-- trigger (kept picks_enforce_deadline)"). Solo queda `picks_enforce_deadline`.)
--
-- ARREGLO: el candado existe para impedir que se cambien PRONÓSTICOS después del
-- cierre, no para impedir que el sistema escriba PUNTAJES. Se separa el trigger
-- combinado en dos, reutilizando EXACTAMENTE la misma lista de columnas de predicción
-- que ya usa picks_updated_at (20260611160000_picks_updated_at_solo_predicciones.sql:
-- groups, group_k_matches, extra_matches, goleador_id, arquero_id) — no una lista nueva:
--
--   1. `picks_enforce_deadline_insert` — BEFORE INSERT (sin cambios de fondo: una
--      planilla nueva después del cierre sigue bloqueada, para todos menos el admin).
--   2. `picks_enforce_deadline_predicciones` — BEFORE UPDATE OF groups,
--      group_k_matches, extra_matches, goleador_id, arquero_id (el filtro nativo de
--      Postgres: solo dispara si el UPDATE incluye alguna de esas columnas en su SET).
--      Un UPDATE que solo toca columnas de puntaje NUNCA activa este trigger — no hace
--      falta ninguna comparación OLD/NEW escrita a mano, es el mismo mecanismo que ya
--      usa picks_updated_at, aplicado al mismo criterio.
--
-- La función `enforce_picks_deadline()` NO cambia — sigue siendo la misma, con el mismo
-- bypass de admin y los mismos candados por-partido/por-ronda (que ya estaban
-- correctamente acotados: comparan NEW vs OLD antes de aplicar el candado, así que
-- nunca fueron parte de este bug). Solo cambian los DOS triggers que la invocan.
--
-- NO se exime a service_role en bloque, ni se toca el comportamiento para
-- participantes: cualquier UPDATE que toque una columna de predicción —sea quien sea
-- el llamador, con sesión o sin ella— sigue pasando por el candado exactamente igual
-- que hoy.

DROP TRIGGER IF EXISTS picks_enforce_deadline ON public.picks;

CREATE TRIGGER picks_enforce_deadline_insert
  BEFORE INSERT ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_picks_deadline();

CREATE TRIGGER picks_enforce_deadline_predicciones
  BEFORE UPDATE OF groups, group_k_matches, extra_matches, goleador_id, arquero_id
  ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_picks_deadline();

-- Recordatorio: NO aplicada a producción. Ver el E2E transaccional
-- (scripts/e2e_deadline_solo_predicciones.mjs, patrón ROLLBACK) antes de aplicar.
