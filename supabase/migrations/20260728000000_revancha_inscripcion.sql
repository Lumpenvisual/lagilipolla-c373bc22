-- Cierra el hueco de RLS que dejó abierto el esquema de La Revancha
-- (20260725000000_repechaje_schema.sql / 20260726000000_repechaje_a_revancha.sql) para que
-- el flujo real de inscripción — persona nueva solo-revancha, o participante existente que
-- pide entrar — pueda escribir su propia fila sin poder mentirle a la tabla ni aprobarse a
-- sí mismo. Sin esto, la UI de inscripción (tarea siguiente) no tiene ningún camino legal
-- para insertar/actualizar `participants` desde el cliente.
--
-- ============================================================================
-- 1) estado_pago pasa a NULLABLE — decisión confirmada con el usuario (no adivinada).
-- ============================================================================
-- Alternativas descartadas: dejarlo NOT NULL con DEFAULT 'pendiente' (mentira: alguien
-- solo-revancha nunca "está pendiente" de pagar la polla original, no aplicó) o inventar un
-- cuarto valor tipo 'no_aplica' en el CHECK (obliga a todo el código que ya hace
-- `estado_pago === 'aprobado' | 'rechazado' | 'pendiente'` — dashboard, PagosTab, reportes —
-- a aprender un cuarto caso que no es un estado de pago, es la ausencia de inscripción).
-- NULL ya es el patrón establecido en esta misma tabla para exactamente esta idea:
-- estado_pago_revancha usa NULL para "nunca aplicó" vs 'pendiente' para "aplicó, en espera"
-- (ver 20260725000000_repechaje_schema.sql). Mismo criterio, misma columna hermana.
--
-- El CHECK (estado_pago IN ('pendiente','aprobado','rechazado')) ya deja pasar NULL sin
-- tocarlo — Postgres no evalúa un CHECK contra una columna NULL. Ningún dato existente
-- cambia: los 41 participants actuales ya tienen estado_pago no-nulo.
ALTER TABLE public.participants
  ALTER COLUMN estado_pago DROP NOT NULL;

-- ============================================================================
-- 1b) en_polla_original pierde el DEFAULT false — decisión del usuario, no mía.
-- ============================================================================
-- El DEFAULT false ya causó un bug real: RegistrationForm.tsx nunca lo seteaba
-- explícitamente y se apoyaba en el default, así que TODA alta a la polla principal desde
-- que se aplicó el esquema de Revancha (25-jul-2026) nació con en_polla_original=false —
-- invisible para get_polla_leaderboard() aunque el admin aprobara el pago. Una columna que
-- decide si alguien cuenta o no en la tabla principal no debería tener un valor por omisión
-- que excluye en silencio a quien se olvide de nombrarla explícitamente.
--
-- Quitar el DEFAULT (no el NOT NULL: sigue siendo obligatoria) obliga a que CUALQUIER
-- INSERT — cliente vía RLS, admin, un script futuro con service_role — nombre el valor a
-- propósito. Ya no hay "hereda false sin darse cuenta". Los 41 participants actuales no se
-- ven afectados (ya tienen un valor concreto, DROP DEFAULT no toca filas existentes, solo
-- futuros INSERT sin esa columna en la lista).
ALTER TABLE public.participants
  ALTER COLUMN en_polla_original DROP DEFAULT;

-- ============================================================================
-- 2) participants_own_insert — cierra el hueco: hoy el WITH CHECK no dice nada de
--    estado_pago_revancha, así que un self-signup podría insertarse directamente con
--    estado_pago_revancha = 'aprobado' y saltarse al admin por completo.
-- ============================================================================
-- Los DOS caminos de alta (ver tarea): main-polla y solo-revancha son las ÚNICAS dos
-- formas que un INSERT propio puede tomar — cualquier otra combinación de estas cuatro
-- columnas queda fuera del WITH CHECK y Postgres la rechaza:
--   A) main-polla:     en_polla_original = true,  estado_pago = 'pendiente',  estado_pago_revancha IS NULL
--   B) solo-revancha:  en_polla_original = false, estado_pago IS NULL,        estado_pago_revancha = 'pendiente'
-- Ninguna de las dos permite 'aprobado' en ningún campo — la aprobación es exclusiva de
-- participants_admin_all (FOR ALL, admin only), que este policy no toca.
DROP POLICY IF EXISTS "participants_own_insert" ON public.participants;
CREATE POLICY "participants_own_insert" ON public.participants FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (en_polla_original = true  AND estado_pago = 'pendiente' AND estado_pago_revancha IS NULL)
      OR
      (en_polla_original = false AND estado_pago IS NULL        AND estado_pago_revancha = 'pendiente')
    )
  );

-- ============================================================================
-- 3) participants_own_update — NO EXISTÍA NINGUNA policy de update propio. Hace falta para
--    que un participante YA existente de la polla pueda "pedir entrar a La Revancha" sin
--    pasar por el admin (poner su propio estado_pago_revancha en 'pendiente').
-- ============================================================================
-- Mismo criterio que picks_validate/picks_validate_before (20260610160000): la policy de
-- RLS solo exige dueño de la fila (USING/WITH CHECK por user_id) — la restricción REAL,
-- campo por campo, vive en un trigger BEFORE UPDATE que compara NEW contra OLD, porque RLS
-- no puede expresar cómodamente "esta columna puede cambiar, esa no, y solo en esta
-- dirección" en una sola expresión USING/WITH CHECK.
--
-- Por qué no GRANT UPDATE (col) a nivel Postgres en su lugar: el admin de este proyecto
-- conecta con el MISMO rol `authenticated` que cualquier participante (no hay un rol
-- Postgres separado para admin) — un REVOKE a nivel columna bloquearía también las
-- aprobaciones del propio admin salvo que se re-otorgue con cuidado column-by-column, más
-- frágil que una policy de RLS + trigger con bypass explícito por rol de aplicación
-- (has_role). Ya se había descartado esta alternativa por el mismo motivo al diseñar el
-- guard de repechaje_picks.
CREATE POLICY "participants_own_update" ON public.participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- El trigger: admin (via participants_admin_all) pasa sin restricción — sigue pudiendo
-- aprobar/rechazar cualquier campo como siempre. Para cualquier otro (incl. escrituras sin
-- sesión, ej. auth.uid() IS NULL con service_role — has_role(NULL,'admin') da false y cae
-- en la rama restringida; ningún script de este repo hace UPDATE directo de participants
-- por fuera del admin logueado, así que no hay caso legítimo que esto rompa) solo se
-- permite UNA cosa: estado_pago_revancha pasando de NULL a 'pendiente' — exactamente "pedir
-- entrar a La Revancha", una sola vez. Ni re-intentar tras un rechazo, ni auto-aprobarse:
-- ambos quedan exclusivamente en manos del admin (participants_admin_all).
CREATE OR REPLACE FUNCTION public.participants_own_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.nombre IS DISTINCT FROM OLD.nombre
     OR NEW.celular IS DISTINCT FROM OLD.celular
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.estado_pago IS DISTINCT FROM OLD.estado_pago
     OR NEW.inscripcion_at IS DISTINCT FROM OLD.inscripcion_at
     OR NEW.en_polla_original IS DISTINCT FROM OLD.en_polla_original
  THEN
    RAISE EXCEPTION 'Ese campo solo lo puede cambiar un administrador.';
  END IF;

  IF NEW.estado_pago_revancha IS DISTINCT FROM OLD.estado_pago_revancha
     AND (OLD.estado_pago_revancha IS NOT NULL OR NEW.estado_pago_revancha IS DISTINCT FROM 'pendiente')
  THEN
    RAISE EXCEPTION 'Solo puedes pedir entrar a La Revancha una vez; la aprobación la hace el administrador.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.participants_own_update_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participants_own_update_guard() TO service_role;

DROP TRIGGER IF EXISTS participants_own_update_guard_before ON public.participants;
CREATE TRIGGER participants_own_update_guard_before
  BEFORE UPDATE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.participants_own_update_guard();
