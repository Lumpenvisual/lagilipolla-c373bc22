import { matchPts, type PickMatches } from "./polla";

/**
 * Matriz de marcadores por partido (una fila por partido, una columna por participante).
 * Módulo puro compartido entre el export a Excel (server, reports.functions.ts) y la vista
 * en pantalla del admin (cliente) — así el cruce array↔objeto y el cálculo de puntos viven
 * en un solo lugar. No decide privacidad ni consulta la BD: ambos llamadores son admin-only
 * por su cuenta (RLS `picks_admin_all` en el cliente, `requireAdmin` en el server function).
 */

export type MatrizCelda = { marcador: string | null; pts: number };

/** Forma mínima de un partido (GroupMatch o ExtraMatch comparten estos campos). */
export type MatrizPartido = { id: string; gh: number | null; ga: number | null };

/**
 * Celdas de un partido para una lista de participantes — el cruce array↔objeto: el partido
 * es un elemento de `tournament_state.group_k_matches`/`extra_matches` (array), pero cada
 * pick lo indexa por id en un objeto jsonb (`pick.group_k_matches`/`extra_matches`). Mismo
 * criterio que `calc_pick_points`/`matchPts`: sin marcador (propio u oficial) → 0 puntos,
 * celda vacía si el participante no pronosticó (o no tiene fila en `picks`).
 */
export function celdasDelPartido(
  match: MatrizPartido,
  participantIds: string[],
  pickMatchesById: Map<string, PickMatches | null | undefined>,
): Map<string, MatrizCelda> {
  const celdas = new Map<string, MatrizCelda>();
  for (const pid of participantIds) {
    const pm = pickMatchesById.get(pid)?.[match.id];
    const gh = pm?.gh ?? null;
    const ga = pm?.ga ?? null;
    const marcador = gh != null && ga != null ? `${gh}-${ga}` : null;
    celdas.set(pid, { marcador, pts: matchPts(match.gh, match.ga, gh, ga) });
  }
  return celdas;
}

/** "2-1" si el partido tiene marcador oficial completo, "" si no (aún no jugado). */
export function oficialTexto(match: MatrizPartido): string {
  return match.gh != null && match.ga != null ? `${match.gh}-${match.ga}` : "";
}

/**
 * Texto de celda para Excel/pantalla: "2-1 (5)" si el partido ya tiene oficial (los puntos
 * son definitivos), o solo "2-1" si todavía no se jugó — el "(0)" de matchPts ahí no
 * significa "fallaste", significa "no se sabe todavía"; no lo mostramos como si fuera un
 * fallo. "" si el participante no pronosticó.
 */
export function formatCelda(celda: MatrizCelda, hayOficial: boolean): string {
  if (!celda.marcador) return "";
  return hayOficial ? `${celda.marcador} (${celda.pts})` : celda.marcador;
}

/** Conteo de aciertos (5/3/2/1/0) entre las celdas de un partido — hoja/fila "Resumen". */
export function resumenDePartido(celdas: Map<string, MatrizCelda>): {
  c5: number;
  c3: number;
  c2: number;
  c1: number;
  c0: number;
} {
  let c5 = 0,
    c3 = 0,
    c2 = 0,
    c1 = 0,
    c0 = 0;
  for (const { pts } of celdas.values()) {
    if (pts === 5) c5++;
    else if (pts === 3) c3++;
    else if (pts === 2) c2++;
    else if (pts === 1) c1++;
    else c0++;
  }
  return { c5, c3, c2, c1, c0 };
}
