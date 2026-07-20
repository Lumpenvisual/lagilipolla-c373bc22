/**
 * Reporte del recálculo de puntos (RPC recalc_all_picks_report / recalc_all_picks_internal).
 * El toast del admin se decide aquí (puro, testeable): nunca "éxito" si no se recalculó
 * nadie, y advertencia (no éxito) cuando hubo partidos o grupos oficiales omitidos.
 */

export type RecalcOmitido = { id: string; motivo: string };

export type RecalcReport = {
  participantes: number;
  partidos_omitidos: RecalcOmitido[];
  grupos_omitidos: RecalcOmitido[];
  aciertos_especiales: { goleador: number; arquero: number };
};

export type RecalcToastPlan =
  | { level: "error" }
  | { level: "success"; participantes: number }
  | { level: "warning"; participantes: number; omitidos: string[] };

/** Normaliza el jsonb del RPC (puede venir null/malformado) a un RecalcReport. */
export function parseRecalcReport(data: unknown): RecalcReport | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<RecalcReport>;
  if (typeof d.participantes !== "number") return null;
  return {
    participantes: d.participantes,
    partidos_omitidos: Array.isArray(d.partidos_omitidos) ? d.partidos_omitidos : [],
    grupos_omitidos: Array.isArray(d.grupos_omitidos) ? d.grupos_omitidos : [],
    aciertos_especiales: d.aciertos_especiales ?? { goleador: 0, arquero: 0 },
  };
}

/** Decide el toast: error si no se recalculó nadie; advertencia con la lista de
 * omitidos si el recálculo fue parcial; éxito solo si fue completo. */
export function recalcToastPlan(report: RecalcReport | null): RecalcToastPlan {
  if (!report || report.participantes <= 0) return { level: "error" };
  const omitidos = [
    ...report.partidos_omitidos.map((p) => `${p.id}: ${p.motivo}`),
    ...report.grupos_omitidos.map((g) => `grupo ${g.id}: ${g.motivo}`),
  ];
  if (omitidos.length) return { level: "warning", participantes: report.participantes, omitidos };
  return { level: "success", participantes: report.participantes };
}
