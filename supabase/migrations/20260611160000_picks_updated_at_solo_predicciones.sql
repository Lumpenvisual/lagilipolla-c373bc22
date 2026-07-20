-- El código del comprobante deriva de picks.updated_at. El trigger picks_updated_at
-- se disparaba en CUALQUIER update (incluido calc_pick_points al recalcular puntos),
-- así que cada recálculo del admin cambiaba updated_at e invalidaba el QR de los
-- comprobantes ya descargados.
-- Fix: updated_at solo se actualiza cuando cambian las PREDICCIONES del usuario
-- (groups / group_k_matches / extra_matches / goleador_id / arquero_id), no cuando
-- solo cambian los puntos. Así el comprobante es estable salvo que el usuario edite.
--
-- OJO al tocar esta lista de columnas: picks_enforce_deadline_predicciones
-- (20260722000000_deadline_solo_predicciones.sql) usa EXACTAMENTE la misma lista
-- para decidir qué UPDATE queda sujeto al candado de cierre. Si algún día se añade
-- una columna de predicción nueva, hay que actualizar AMBOS triggers — si solo se
-- actualiza este, el candado deja de proteger ese campo nuevo en silencio.
DROP TRIGGER IF EXISTS picks_updated_at ON public.picks;
CREATE TRIGGER picks_updated_at
  BEFORE UPDATE OF groups, group_k_matches, extra_matches, goleador_id, arquero_id
  ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
