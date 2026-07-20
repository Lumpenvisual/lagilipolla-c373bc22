-- PROPUESTA — NO APLICADA. Evaluada a pedido del admin (aviso persistente de resultados
-- oficiales incompletos, jul-2026). Ver el análisis completo en el informe de esa tarea;
-- resumen aquí para quien encuentre este archivo más adelante.
--
-- Problema real: no hay NINGUNA validación a nivel BD sobre
-- tournament_state.group_k_matches / extra_matches. picks_validate cubre `picks`, pero el
-- estado OFICIAL se puede escribir parcial desde cualquier vía — UI (aunque save() ya no
-- bloquea desde T4), script, o Management API directo. `_gp_score_invalid` (la misma
-- función que usa picks_validate) es la definición canónica de "parcial = inválido".
--
-- POR QUÉ ESTA VERSIÓN Y NO LA OBVIA (rechazar cualquier UPDATE con un solo marcador
-- inválido en cualquier parte del arreglo, como hace picks_validate con los picks de UN
-- participante):
--
--   tournament_state es un singleton compartido que se edita de forma incremental durante
--   MESES (grupo por grupo, fecha por fecha). Un trigger que revalidara el arreglo ENTERO
--   en cada guardado bloquearía CUALQUIER guardado futuro —incluso a un partido totalmente
--   distinto— mientras exista UN SOLO marcador olvidado a medias en cualquier parte del
--   torneo. Ese es exactamente el escenario que el banner persistente del admin (mismo
--   commit) existe para señalar SIN bloquear: T4 quitó a propósito el bloqueo global de
--   save() por esta misma razón (guardar una cosa no debe depender de que TODO lo demás
--   esté perfecto). Un trigger duro lo resucitaría, pero peor: en vez de un toast legible,
--   el admin vería una excepción de Postgres cruda, y quedaría con el sistema
--   "atascado" — no puede corregir NADA más hasta encontrar y arreglar el partido viejo
--   que ni siquiera estaba tocando. Es la misma familia de riesgo que el hallazgo #20
--   (enforce_picks_deadline bloqueando un recálculo por una condición ajena a lo que se
--   está guardando) — "dos guards que se disparan en cadena".
--
--   Por eso esta versión compara OLD vs NEW: SOLO valida los partidos cuyo gh/ga CAMBIA
--   en este UPDATE (o que son nuevos). Un marcador ya inválido que el UPDATE actual no
--   toca se deja pasar (ya lo señala el banner persistente; no bloquea nada nuevo). Esto
--   es análogo a la parte de INMUTABILIDAD de picks_validate (que también diffea OLD vs
--   NEW por clave) — no a su parte de validez, que sí es incondicional sobre TODO el
--   arreglo de NEW, y que es segura ahí solo porque cada fila de `picks` es aislada por
--   participante (el error de uno no bloquea a los demás ni al admin).
--
-- INTERACCIÓN CON #20 (picks_locked_at / enforce_picks_deadline): ninguna directa. Ese
-- trigger vive en `picks`, no en `tournament_state`; y es BEFORE UPDATE en `picks`
-- mientras que el recálculo (ts_recalc_on_official_change) es AFTER UPDATE en
-- tournament_state — esta validación nueva es OTRO trigger BEFORE UPDATE en
-- tournament_state, así que corre ANTES de llegar siquiera al recálculo: si rechaza, la
-- cascada hacia `picks` (donde vive #20) nunca arranca. A diferencia de
-- enforce_picks_deadline, esta validación NO depende de auth.uid()/sesión — se comporta
-- igual para la UI del admin, un script vía Management API, o cualquier otra vía. Por
-- eso no puede reproducir la clase de bug de #20 (una condición de seguridad que se
-- comporta distinto según quién dispara el UPDATE).
--
-- VERIFICADO CONTRA FLUJOS REALES (solo lectura, sin aplicar nada): revisé
-- apply_official_data.mjs y las 5 migraciones que escriben group_k_matches/extra_matches
-- con gh/ga — todas siembran SIEMPRE ambos campos null juntos (nunca parcial). Ninguna
-- se vería afectada por esta validación, con o sin el diff.
--
-- RECOMENDACIÓN: aplicar ESTA versión (diff-based), no una que revalide todo el arreglo
-- sin condición. Antes de aplicar en producción: correr el equivalente transaccional de
-- scripts/e2e_recalc_categorias.mjs (UPDATE con un marcador a medias nuevo → debe
-- rechazar; UPDATE que deja intacto un marcador viejo a medias y solo toca otro partido
-- → debe pasar) y confirmar con ROLLBACK antes de un apply real.

CREATE OR REPLACE FUNCTION public._ts_validate_scores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  m jsonb;
  old_m jsonb;
  mid text;
BEGIN
  -- group_k_matches: array de partidos (no objeto por id, a diferencia de picks) —
  -- se casa OLD↔NEW por el campo "id" de cada elemento.
  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.group_k_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.group_k_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      RAISE EXCEPTION
        'Marcador oficial inválido en group_k_matches (partido %): usa un solo dígito (0–9) en ambos campos, o déjalos vacíos si no se ha jugado.',
        mid;
    END IF;
  END LOOP;

  -- extra_matches: mismo criterio (también array, con "fase" además de "id").
  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.extra_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.extra_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      RAISE EXCEPTION
        'Marcador oficial inválido en extra_matches (partido %): usa un solo dígito (0–9) en ambos campos, o déjalos vacíos si no se ha jugado.',
        mid;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._ts_validate_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ts_validate_scores() TO service_role, authenticated;

DROP TRIGGER IF EXISTS ts_validate_scores ON public.tournament_state;
CREATE TRIGGER ts_validate_scores
  BEFORE UPDATE ON public.tournament_state
  FOR EACH ROW
  WHEN (
    NEW.group_k_matches IS DISTINCT FROM OLD.group_k_matches
    OR NEW.extra_matches IS DISTINCT FROM OLD.extra_matches
  )
  EXECUTE FUNCTION public._ts_validate_scores();

-- Recordatorio: esta migración NO se ha aplicado a producción. Si se decide aplicar,
-- hacerlo vía Management API con el patrón de siempre, y correr primero el E2E
-- transaccional descrito arriba.
