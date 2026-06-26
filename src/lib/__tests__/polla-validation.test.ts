import { describe, it, expect } from "vitest";
import {
  isValidGol,
  lastGol,
  scoreState,
  groupHasDup,
  groupPts,
  matchPts,
  normEspecial,
  isExtraPhaseLocked,
  MAX_GOLES,
  type ExtraMatch,
} from "@/lib/polla";

describe("isValidGol — un solo dígito (0–9)", () => {
  it("acepta enteros 0–9", () => {
    for (let n = 0; n <= MAX_GOLES; n++) expect(isValidGol(n)).toBe(true);
  });
  it("rechaza null, negativos, 2+ dígitos y no enteros", () => {
    expect(isValidGol(null)).toBe(false);
    expect(isValidGol(undefined)).toBe(false);
    expect(isValidGol(-1)).toBe(false);
    expect(isValidGol(10)).toBe(false);
    expect(isValidGol(99)).toBe(false);
    expect(isValidGol(2.5)).toBe(false);
  });
});

describe("lastGol — un solo dígito, sin cero a la izquierda", () => {
  it("vacío → null", () => expect(lastGol("")).toBeNull());
  it("un dígito se conserva", () => {
    expect(lastGol("5")).toBe(5);
    expect(lastGol("0")).toBe(0);
  });
  it("toma el último dígito tecleado (cada tecla reemplaza)", () => {
    expect(lastGol("05")).toBe(5); // escribió 5 sobre un 0 → 5, no 05
    expect(lastGol("53")).toBe(3); // editó un 5 y tecleó 3 → 3, no 53
    expect(lastGol("100")).toBe(0);
  });
  it("ignora caracteres no numéricos", () => {
    expect(lastGol("-3")).toBe(3);
    expect(lastGol("abc")).toBeNull();
  });
});

describe("scoreState — vacío / completo / inválido", () => {
  it("ambos null = vacío (permitido)", () => {
    expect(scoreState({ gh: null, ga: null })).toBe("vacio");
    expect(scoreState(null)).toBe("vacio");
    expect(scoreState(undefined)).toBe("vacio");
  });
  it("ambos 0–9 = completo", () => {
    expect(scoreState({ gh: 0, ga: 0 })).toBe("completo");
    expect(scoreState({ gh: 3, ga: 1 })).toBe("completo");
  });
  it("parcial = inválido", () => {
    expect(scoreState({ gh: 2, ga: null })).toBe("invalido");
    expect(scoreState({ gh: null, ga: 4 })).toBe("invalido");
  });
  it("fuera de rango = inválido", () => {
    expect(scoreState({ gh: 12, ga: 3 })).toBe("invalido");
    expect(scoreState({ gh: 1, ga: -1 })).toBe("invalido");
  });
});

describe("groupHasDup — 1º y 2º repetidos", () => {
  it("detecta el mismo equipo en 1º y 2º", () => {
    expect(groupHasDup({ pos1: "COL", pos2: "COL" })).toBe(true);
  });
  it("permite distintos o incompletos", () => {
    expect(groupHasDup({ pos1: "COL", pos2: "BRA" })).toBe(false);
    expect(groupHasDup({ pos1: "COL", pos2: null })).toBe(false);
    expect(groupHasDup({ pos1: null, pos2: null })).toBe(false);
    expect(groupHasDup(null)).toBe(false);
  });
});

describe("groupPts — reglamento 5/3/1 (espejo de calc_pick_points)", () => {
  it("5 por exacto, 3 por invertido, 1 por uno acertado, 0 sin aciertos", () => {
    expect(groupPts("COL", "POR", "COL", "POR")).toBe(5);
    expect(groupPts("COL", "POR", "POR", "COL")).toBe(3);
    expect(groupPts("COL", "POR", "COL", "UZB")).toBe(1);
    expect(groupPts("COL", "POR", "UZB", "COD")).toBe(0);
  });
  it("0 si falta el oficial o el pick", () => {
    expect(groupPts(null, "POR", "COL", "POR")).toBe(0);
    expect(groupPts("COL", "POR", null, "POR")).toBe(0);
  });
});

describe("matchPts — reglamento 5/3/2/1/1/0 (espejo de calc_pick_points)", () => {
  it("5 marcador exacto", () => expect(matchPts(2, 1, 2, 1)).toBe(5));
  it("3 ganador + goles de un equipo", () => expect(matchPts(2, 1, 2, 0)).toBe(3));
  it("2 solo ganador", () => expect(matchPts(2, 1, 3, 0)).toBe(2));
  it("1 empate acertado (otro marcador)", () => expect(matchPts(1, 1, 2, 2)).toBe(1));
  it("1 goles de un equipo sin acertar resultado", () => expect(matchPts(2, 1, 2, 3)).toBe(1));
  it("0 ningún acierto", () => expect(matchPts(2, 1, 0, 3)).toBe(0));
  it("0 si falta oficial o pick", () => {
    expect(matchPts(null, 1, 2, 1)).toBe(0);
    expect(matchPts(2, 1, null, 1)).toBe(0);
  });
});

describe("isExtraPhaseLocked — cierre por ronda 1h antes del primer partido", () => {
  const mk = (id: string, fase: ExtraMatch["fase"], fecha: string): ExtraMatch => ({
    id,
    fase,
    fecha,
    local: "A",
    visitante: "B",
    sede: "",
    gh: null,
    ga: null,
  });
  // Ronda de dieciseisavos: primer partido el 1 jul 12:00Z, otro 3 días después.
  const extra: ExtraMatch[] = [
    mk("ko-73", "dieciseisavos", "2026-07-01T12:00:00Z"),
    mk("ko-88", "dieciseisavos", "2026-07-03T20:00:00Z"),
    mk("ko-104", "final", "2026-07-19T19:00:00Z"),
  ];
  const firstMs = new Date("2026-07-01T12:00:00Z").getTime();

  it("abierta a más de 1h del primer partido", () => {
    expect(isExtraPhaseLocked(extra, "dieciseisavos", firstMs - 61 * 60 * 1000)).toBe(false);
  });
  it("cerrada a 1h o menos del primer partido (toda la ronda, aunque otros sean días después)", () => {
    expect(isExtraPhaseLocked(extra, "dieciseisavos", firstMs - 60 * 60 * 1000)).toBe(true);
    expect(isExtraPhaseLocked(extra, "dieciseisavos", firstMs - 30 * 60 * 1000)).toBe(true);
    expect(isExtraPhaseLocked(extra, "dieciseisavos", firstMs + 1)).toBe(true);
  });
  it("no bloquea si la fase no tiene fechas válidas (aún sin programar)", () => {
    const sinFecha = [mk("ko-89", "octavos", ""), mk("ko-90", "octavos", "")];
    expect(isExtraPhaseLocked(sinFecha, "octavos", firstMs)).toBe(false);
  });
  it("no bloquea una fase distinta a la del primer partido próximo", () => {
    expect(isExtraPhaseLocked(extra, "final", firstMs)).toBe(false);
  });
});

describe("normEspecial — espejo de norm_especial en SQL", () => {
  it("tolera mayúsculas, acentos y espacios extra", () => {
    expect(normEspecial("  KYLIAN  Mbappé (Francia) ")).toBe("kylian mbappe (francia)");
    expect(normEspecial("Ñoño Çelik")).toBe("nono celik");
  });
  it("null/undefined → null", () => {
    expect(normEspecial(null)).toBeNull();
    expect(normEspecial(undefined)).toBeNull();
  });
  it("dos escrituras distintas del mismo nombre coinciden", () => {
    expect(normEspecial("HARRY KANE  (Inglaterra)")).toBe(normEspecial("harry kane (inglaterra)"));
  });
});
