import { describe, it, expect } from "vitest";
import {
  celdasDelPartido,
  oficialTexto,
  formatCelda,
  resumenDePartido,
  type MatrizPartido,
} from "@/lib/marcadores-matrix";
import type { PickMatches } from "@/lib/polla";

/**
 * El cruce array↔objeto es el riesgo real de esta vista: `group_k_matches`/`extra_matches`
 * son ARRAYS en tournament_state, pero cada pick los indexa por id en un OBJETO jsonb
 * (`pick.group_k_matches`/`extra_matches`). Estos tests cubren ese cruce en ambos sentidos,
 * más los casos de "sin resultado oficial" y "participante sin fila en picks" pedidos.
 */
describe("celdasDelPartido — cruce array↔objeto por id", () => {
  const match: MatrizPartido = { id: "m1", gh: 2, ga: 1 };
  const ids = ["a", "b", "c"];

  it("un pronóstico coincide con matchPts para los 5 casos (5/3/2/1/0)", () => {
    const casos: [PickMatches, number][] = [
      [{ m1: { gh: 2, ga: 1 } }, 5], // exacto
      [{ m1: { gh: 2, ga: 0 } }, 3], // ganador acertado + goles del local exactos
      [{ m1: { gh: 3, ga: 0 } }, 2], // solo el ganador
      [{ m1: { gh: 2, ga: 3 } }, 1], // goles del local exactos, pero ganador equivocado
      [{ m1: { gh: 0, ga: 3 } }, 0], // nada acertado
    ];
    for (const [pm, esperado] of casos) {
      const celdas = celdasDelPartido(match, ["a"], new Map([["a", pm]]));
      expect(celdas.get("a")?.pts).toBe(esperado);
    }
  });

  it("partido sin pronóstico → celda vacía (marcador null), 0 puntos, sin crash", () => {
    const celdas = celdasDelPartido(match, ids, new Map());
    for (const id of ids) {
      expect(celdas.get(id)).toEqual({ marcador: null, pts: 0 });
    }
  });

  it("pronóstico parcial (solo gh o solo ga) cuenta como sin pronóstico", () => {
    const celdas = celdasDelPartido(match, ["a"], new Map([["a", { m1: { gh: 2, ga: null } }]]));
    expect(celdas.get("a")).toEqual({ marcador: null, pts: 0 });
  });

  it("participante presente en la lista pero sin entrada en el Map de picks → celda vacía", () => {
    const picksById = new Map<string, PickMatches>([["a", { m1: { gh: 2, ga: 1 } }]]);
    const celdas = celdasDelPartido(match, ["a", "sin-picks"], picksById);
    expect(celdas.get("a")?.marcador).toBe("2-1");
    expect(celdas.get("sin-picks")).toEqual({ marcador: null, pts: 0 });
  });

  it("un pronóstico de OTRO partido (id distinto) no contamina este partido", () => {
    const picksById = new Map<string, PickMatches>([["a", { otro: { gh: 5, ga: 5 } }]]);
    const celdas = celdasDelPartido(match, ["a"], picksById);
    expect(celdas.get("a")).toEqual({ marcador: null, pts: 0 });
  });
});

describe("oficialTexto — sin romper con partidos futuros", () => {
  it("marcador oficial completo → 'gh-ga'", () => {
    expect(oficialTexto({ id: "m1", gh: 2, ga: 1 })).toBe("2-1");
  });
  it("sin resultado oficial (partido futuro) → cadena vacía", () => {
    expect(oficialTexto({ id: "m1", gh: null, ga: null })).toBe("");
  });
});

describe("un partido sin resultado oficial → 0 puntos para todos, sin romper", () => {
  it("todas las celdas dan 0 puntos aunque el participante haya pronosticado algo", () => {
    const match: MatrizPartido = { id: "m1", gh: null, ga: null };
    const picksById = new Map<string, PickMatches>([
      ["a", { m1: { gh: 2, ga: 1 } }],
      ["b", { m1: { gh: 0, ga: 0 } }],
    ]);
    const celdas = celdasDelPartido(match, ["a", "b", "c"], picksById);
    expect(oficialTexto(match)).toBe("");
    expect([...celdas.values()].every((c) => c.pts === 0)).toBe(true);
    // Pero sí conserva lo que escribieron (no lo borra, solo no puntúa todavía).
    expect(celdas.get("a")?.marcador).toBe("2-1");
    expect(celdas.get("c")?.marcador).toBeNull();
  });
});

describe("formatCelda — texto de celda para Excel/pantalla", () => {
  it("sin pronóstico → cadena vacía, con o sin oficial", () => {
    expect(formatCelda({ marcador: null, pts: 0 }, true)).toBe("");
    expect(formatCelda({ marcador: null, pts: 0 }, false)).toBe("");
  });
  it("con oficial ya definido → marcador + puntos entre paréntesis", () => {
    expect(formatCelda({ marcador: "2-1", pts: 5 }, true)).toBe("2-1 (5)");
    expect(formatCelda({ marcador: "0-0", pts: 0 }, true)).toBe("0-0 (0)");
  });
  it("SIN oficial todavía (partido no jugado) → solo el marcador, sin '(0)' engañoso", () => {
    expect(formatCelda({ marcador: "2-1", pts: 0 }, false)).toBe("2-1");
  });
});

describe("resumenDePartido — conteo 5/3/2/1/0 para la hoja Resumen", () => {
  it("cuenta cada nivel de acierto", () => {
    const celdas = new Map([
      ["a", { marcador: "2-1", pts: 5 }],
      ["b", { marcador: "2-1", pts: 5 }],
      ["c", { marcador: "1-0", pts: 3 }],
      ["d", { marcador: "3-0", pts: 2 }],
      ["e", { marcador: "1-1", pts: 1 }],
      ["f", { marcador: "0-3", pts: 0 }],
      ["g", { marcador: null, pts: 0 }],
    ]);
    expect(resumenDePartido(celdas)).toEqual({ c5: 2, c3: 1, c2: 1, c1: 1, c0: 2 });
  });
  it("mapa vacío → todos en cero", () => {
    expect(resumenDePartido(new Map())).toEqual({ c5: 0, c3: 0, c2: 0, c1: 0, c0: 0 });
  });
});
