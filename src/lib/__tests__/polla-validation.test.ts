import { describe, it, expect } from "vitest";
import { isValidGol, clampGol, scoreState, groupHasDup, MAX_GOLES } from "@/lib/polla";

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

describe("clampGol — limita la entrada a 0–9", () => {
  it("vacío → null", () => expect(clampGol("")).toBeNull());
  it("recorta a 9 los valores mayores", () => {
    expect(clampGol("12")).toBe(9);
    expect(clampGol("100")).toBe(9);
  });
  it("recorta a 0 los negativos y conserva 0–9", () => {
    expect(clampGol("-3")).toBe(0);
    expect(clampGol("5")).toBe(5);
  });
  it("no numérico → null", () => expect(clampGol("abc")).toBeNull());
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
