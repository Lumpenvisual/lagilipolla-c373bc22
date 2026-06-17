-- Bug: la política RLS picks_own_update exigía `tournament_state.deadline > now()`,
-- pero `deadline` es una columna HEREDADA con valor fijo en el pasado
-- (2026-06-11). En el modelo actual el cierre de planillas lo controlan:
--   * picks_locked_at  (cierre global que activa el admin)        -> trigger enforce_picks_deadline
--   * lock por-partido 24 h antes del kickoff                     -> trigger enforce_picks_deadline
--   * inmutabilidad de lo ya guardado                             -> trigger picks_validate
--   * habilitación de paneles por fase (visibility/phases)        -> UI (isSectionVisible)
-- Como `deadline` ya pasó, RLS rechazaba TODA actualización de un participante y la
-- planilla mostraba en rojo "No se pudo guardar". Quitamos esa condición obsoleta:
-- el participante puede volver a guardar mientras el admin tenga la edición abierta
-- (picks_locked_at en el futuro) y el partido no esté en su ventana de 24 h.
DROP POLICY IF EXISTS "picks_own_update" ON public.picks;
CREATE POLICY "picks_own_update" ON public.picks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id
        AND p.user_id = auth.uid()
        AND p.estado_pago = 'aprobado'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_id
        AND p.user_id = auth.uid()
        AND p.estado_pago = 'aprobado'
    )
  );
