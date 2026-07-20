import { describe, it, expect } from "vitest";
import { parseRecalcReport, recalcToastPlan } from "@/lib/recalc-report";
import { groupPts, matchPts, especialMatches, scoreState } from "@/lib/polla";

/**
 * NOTA DE COBERTURA (T4): la separación del guard por categoría vive en SQL
 * (calc_pick_points + recalc_all_picks_internal, migración 20260720120000) y NO hay
 * infraestructura de tests SQL en vitest. La verificación REAL del agregado es el
 * E2E transaccional `node scripts/e2e_recalc_categorias.mjs` (corrompe grupo A y
 * m104 dentro de una transacción, comprueba que solo su categoría se omite y hace
 * ROLLBACK). Aquí se cubren los ESPEJOS TS de cada pieza y el plan del toast.
 */
describe("separación del guard por categoría (espejos TS de calc_pick_points)", () => {
  it("1. un partido con gh=2, ga=null es inválido y NO impide puntuar grupos", () => {
    // el marcador a medio llenar es 'invalido' y ese partido aporta 0…
    expect(scoreState({ gh: 2, ga: null })).toBe("invalido");
    expect(matchPts(2, null, 2, 1)).toBe(0);
    // …pero los grupos se puntúan igual (funciones independientes, como el SQL por-ítem)
    expect(groupPts("COL", "POR", "COL", "POR")).toBe(5);
  });

  it("2. ese mismo estado NO impide los 10 del goleador (especiales siempre)", () => {
    expect(especialMatches("Kylian Mbappé (Francia)", "Kylian Mbappé (Francia)")).toBe(true);
  });

  it("3. el partido inválido aporta 0, no rompe el cálculo", () => {
    expect(matchPts(2, null, 2, 1)).toBe(0); // incompleto
    expect(matchPts(12, 0, 1, 0)).toBe(0); // fuera de rango (espejo de _gp_score_invalid)
    expect(matchPts(2, 1, 2, 1)).toBe(5); // el resto sigue puntuando normal
  });

  it("4. un grupo oficial con 1º=2º se omite (0 pts) sin afectar otros grupos", () => {
    expect(groupPts("COL", "COL", "COL", "POR")).toBe(0); // antes daba 1 por coincidencia parcial
    expect(groupPts("COL", "POR", "POR", "COL")).toBe(3); // otro grupo, intacto
  });
});

describe("recalcToastPlan — el toast dice la verdad", () => {
  const base = {
    participantes: 37,
    partidos_omitidos: [],
    grupos_omitidos: [],
    aciertos_especiales: { goleador: 13, arquero: 5 },
  };

  it("éxito solo cuando se recalculó todo", () => {
    expect(recalcToastPlan(base)).toEqual({ level: "success", participantes: 37 });
  });

  it("advertencia listando qué se omitió y por qué", () => {
    const plan = recalcToastPlan({
      ...base,
      partidos_omitidos: [{ id: "m98", motivo: "marcador incompleto" }],
      grupos_omitidos: [{ id: "B", motivo: "1º y 2º repetidos" }],
    });
    expect(plan).toEqual({
      level: "warning",
      participantes: 37,
      omitidos: ["m98: marcador incompleto", "grupo B: 1º y 2º repetidos"],
    });
  });

  it("nunca 'Puntos recalculados' cuando el resultado fue 0 o no hay reporte", () => {
    expect(recalcToastPlan({ ...base, participantes: 0 }).level).toBe("error");
    expect(recalcToastPlan(null).level).toBe("error");
  });

  it("parseRecalcReport tolera jsonb nulo o malformado", () => {
    expect(parseRecalcReport(null)).toBeNull();
    expect(parseRecalcReport("x")).toBeNull();
    expect(parseRecalcReport({})).toBeNull();
    expect(parseRecalcReport(base)).toEqual(base);
    expect(parseRecalcReport({ participantes: 5 })).toEqual({
      participantes: 5,
      partidos_omitidos: [],
      grupos_omitidos: [],
      aciertos_especiales: { goleador: 0, arquero: 0 },
    });
  });
});
