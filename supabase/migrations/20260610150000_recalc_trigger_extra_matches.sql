-- El trigger picks_recalc_after_change disparaba el recálculo de puntos solo cuando
-- cambiaban groups/group_k_matches/goleador_id/arquero_id, omitiendo extra_matches.
-- Si un participante editaba únicamente sus predicciones de eliminatorias sin tocar
-- otro campo, sus puntos no se recalculaban. Se incluye extra_matches en el UPDATE OF.
-- (El flujo del admin no se ve afectado: usa recalc_all_picks() sobre todos los picks.)
DROP TRIGGER IF EXISTS picks_recalc_after_change ON public.picks;
CREATE TRIGGER picks_recalc_after_change
  AFTER INSERT OR UPDATE OF groups, group_k_matches, extra_matches, goleador_id, arquero_id
  ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.picks_recalc_trigger();
