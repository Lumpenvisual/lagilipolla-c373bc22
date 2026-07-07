import { describe, it, expect } from "vitest";
import type { Groups } from "../polla";
import {
  KNOCKOUT_BRACKET,
  THIRD_SLOT_MATCH_IDS,
  buildExtraMatchesFromBracket,
  applyRound32,
  applyAdvance,
  advanceAllRounds,
  slotLabel,
} from "../knockout-bracket";

/** Grupos mínimos con 1°/2° definidos para todos (A–L), con códigos tipo equipo (2 letras). */
function makeGroups(): Groups {
  const code = (g: string, p: 1 | 2) => `${g}${p === 1 ? "X" : "Y"}`; // p.ej. "AX", "AY"
  const g = {} as Groups;
  for (const k of "ABCDEFGHIJKL".split("")) {
    (g as Record<string, unknown>)[k] = {
      teams: [],
      pos1: code(k, 1),
      pos2: code(k, 2),
    };
  }
  return g;
}

describe("plantilla del bracket", () => {
  it("tiene 32 partidos con ids únicos (m73…m104) y fases correctas", () => {
    expect(KNOCKOUT_BRACKET).toHaveLength(32);
    const ids = new Set(KNOCKOUT_BRACKET.map((m) => m.id));
    expect(ids.size).toBe(32);
    expect(ids.has("m73")).toBe(true);
    expect(ids.has("m104")).toBe(true);
    const count = (f: string) => KNOCKOUT_BRACKET.filter((m) => m.fase === f).length;
    expect(count("dieciseisavos")).toBe(16);
    expect(count("octavos")).toBe(8);
    expect(count("cuartos")).toBe(4);
    expect(count("semis")).toBe(2);
    expect(count("tercero")).toBe(1);
    expect(count("final")).toBe(1);
  });

  it("usa cada ganador (1X) y subcampeón (2X) exactamente una vez en dieciseisavos", () => {
    const r32 = KNOCKOUT_BRACKET.filter((m) => m.fase === "dieciseisavos");
    const winners: string[] = [];
    const runners: string[] = [];
    for (const m of r32) {
      for (const slot of [m.local, m.visitante]) {
        if (slot.kind === "winner") winners.push(slot.group);
        if (slot.kind === "runner") runners.push(slot.group);
      }
    }
    expect([...winners].sort().join("")).toBe("ABCDEFGHIJKL");
    expect([...runners].sort().join("")).toBe("ABCDEFGHIJKL");
  });

  it("tiene exactamente 8 slots de tercero (mejores terceros)", () => {
    expect(THIRD_SLOT_MATCH_IDS).toHaveLength(8);
  });

  it("las rondas posteriores referencian solo ids de plantilla existentes", () => {
    const ids = new Set(KNOCKOUT_BRACKET.map((m) => m.id));
    for (const m of KNOCKOUT_BRACKET) {
      for (const slot of [m.local, m.visitante]) {
        if (slot.kind === "matchWinner" || slot.kind === "matchLoser") {
          expect(ids.has(slot.match)).toBe(true);
        }
      }
    }
  });
});

describe("buildExtraMatchesFromBracket", () => {
  it("siembra 32 partidos con placeholders, sin marcador y con fecha oficial", () => {
    const ex = buildExtraMatchesFromBracket();
    expect(ex).toHaveLength(32);
    for (const m of ex) {
      expect(m.gh).toBeNull();
      expect(m.ga).toBeNull();
      expect(m.fecha).not.toBe("");
      expect(m.local).not.toBe("");
      expect(m.visitante).not.toBe("");
    }
  });
});

describe("applyRound32", () => {
  it("resuelve 1X/2X desde pos1/pos2 y deja placeholder en terceros sin asignar", () => {
    const out = applyRound32(buildExtraMatchesFromBracket(), makeGroups(), {});
    const m73 = out.find((m) => m.id === "m73")!; // 2A vs 2B
    expect(m73.local).toBe("AY");
    expect(m73.visitante).toBe("BY");
    const m75 = out.find((m) => m.id === "m75")!; // 1F vs 2C
    expect(m75.local).toBe("FX");
    expect(m75.visitante).toBe("CY");
    const m74 = out.find((m) => m.id === "m74")!; // 1E vs 3°
    expect(m74.local).toBe("EX");
    expect(m74.visitante).toBe(slotLabel({ kind: "third", groups: ["A", "B", "C", "D", "F"] }));
  });

  it("asigna el tercero indicado por el admin", () => {
    const out = applyRound32(buildExtraMatchesFromBracket(), makeGroups(), {
      m74: "BRA",
    });
    const m74 = out.find((m) => m.id === "m74")!;
    expect(m74.visitante).toBe("BRA");
  });

  it("preserva marcadores ya cargados y no toca otras fases", () => {
    const seed = buildExtraMatchesFromBracket();
    const m73 = seed.find((m) => m.id === "m73")!;
    m73.gh = 2;
    m73.ga = 1;
    const out = applyRound32(seed, makeGroups(), {});
    const m73out = out.find((m) => m.id === "m73")!;
    expect(m73out.gh).toBe(2);
    expect(m73out.ga).toBe(1);
    // Octavos (matchWinner) siguen como placeholder
    const m89 = out.find((m) => m.id === "m89")!;
    expect(m89.local).toBe("Ganador Partido 74");
  });

  it("es idempotente: vuelve a producir 32 partidos sin duplicar", () => {
    const once = applyRound32(buildExtraMatchesFromBracket(), makeGroups(), {});
    const twice = applyRound32(once, makeGroups(), {});
    expect(twice).toHaveLength(32);
  });
});

describe("applyAdvance", () => {
  it("rellena ganador y perdedor de rondas siguientes desde los ganadores designados", () => {
    // Partimos de dieciseisavos resueltos con terceros asignados (códigos de 3 letras).
    const thirds: Record<string, string> = {
      m74: "TGA",
      m77: "TGB",
      m79: "TGC",
      m80: "TGD",
      m81: "TGE",
      m82: "TGF",
      m85: "TGG",
      m87: "TGH",
    };
    let ex = applyRound32(buildExtraMatchesFromBracket(), makeGroups(), thirds);
    // m74 (EX vs TGA) y m77 (IX vs TGB) → octavo m89 = W74 vs W77
    ex = applyAdvance(ex, { m74: "EX", m77: "TGB" });
    const m89 = ex.find((m) => m.id === "m89")!;
    expect(m89.local).toBe("EX");
    expect(m89.visitante).toBe("TGB");
  });

  it("deduce el perdedor para el partido por el tercer puesto", () => {
    let ex = applyRound32(buildExtraMatchesFromBracket(), makeGroups(), {});
    // Forzamos equipos (códigos de 3 letras) en semifinales y designamos ganadores.
    ex = ex.map((m) => {
      if (m.id === "m101") return { ...m, local: "AAA", visitante: "BBB" };
      if (m.id === "m102") return { ...m, local: "CCC", visitante: "DDD" };
      return m;
    });
    ex = applyAdvance(ex, { m101: "AAA", m102: "DDD" });
    const m103 = ex.find((m) => m.id === "m103")!; // L101 vs L102
    expect(m103.local).toBe("BBB");
    expect(m103.visitante).toBe("CCC");
    const m104 = ex.find((m) => m.id === "m104")!; // W101 vs W102
    expect(m104.local).toBe("AAA");
    expect(m104.visitante).toBe("DDD");
  });
});

describe("advanceAllRounds — auto-avance al guardar (deriva ganadores del marcador)", () => {
  const thirds: Record<string, string> = {
    m74: "TGA",
    m77: "TGB",
    m79: "TGC",
    m80: "TGD",
    m81: "TGE",
    m82: "TGF",
    m85: "TGG",
    m87: "TGH",
  };
  const seedR32 = () => applyRound32(buildExtraMatchesFromBracket(), makeGroups(), thirds);
  const setScore = (ex: ReturnType<typeof seedR32>, id: string, gh: number, ga: number) => {
    const m = ex.find((x) => x.id === id)!;
    m.gh = gh;
    m.ga = ga;
  };

  it("avanza los ganadores de dieciseisavos a octavos (por marcador)", () => {
    const ex = seedR32(); // m74=EX vs TGA · m77=IX vs TGB
    setScore(ex, "m74", 2, 0); // gana EX
    setScore(ex, "m77", 1, 0); // gana IX
    const out = advanceAllRounds(ex);
    const m89 = out.find((m) => m.id === "m89")!; // W74 vs W77
    expect(m89.local).toBe("EX");
    expect(m89.visitante).toBe("IX");
  });

  it("encadena dos rondas en un solo guardado (dieciseisavos→octavos→cuartos)", () => {
    const ex = seedR32();
    setScore(ex, "m74", 2, 0); // EX
    setScore(ex, "m77", 1, 0); // IX → m89 = EX vs IX
    setScore(ex, "m89", 3, 1); // gana EX (aunque m89 arranca con placeholders)
    const out = advanceAllRounds(ex);
    const m97 = out.find((m) => m.id === "m97")!; // W89 vs W90
    expect(m97.local).toBe("EX");
  });

  it("empate: usa el ganador por penales designado", () => {
    const ex = seedR32(); // m73 = AY vs BY
    setScore(ex, "m73", 1, 1);
    const out = advanceAllRounds(ex, { m73: "BY" });
    const m90 = out.find((m) => m.id === "m90")!; // W73 vs W75
    expect(m90.local).toBe("BY");
  });

  it("empate sin penalti designado: deja el placeholder", () => {
    const ex = seedR32();
    setScore(ex, "m73", 1, 1);
    const out = advanceAllRounds(ex, {});
    const m90 = out.find((m) => m.id === "m90")!;
    expect(m90.local).toBe("Ganador Partido 73");
  });
});
