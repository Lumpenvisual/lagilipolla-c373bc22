import { describe, it, expect } from "vitest";
import {
  isValidGol,
  lastGol,
  scoreState,
  groupHasDup,
  groupPts,
  matchPts,
  normEspecial,
  especialMatches,
  isExtraPhaseLocked,
  isExtraPhaseRevealed,
  isTournamentComplete,
  tournamentCompletion,
  teamNameByCode,
  GROUP_KEYS,
  MAX_GOLES,
  type ExtraMatch,
  type Groups,
  type TournamentState,
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

describe("isExtraPhaseRevealed — revela la fase recién al iniciar su primer partido", () => {
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
  const extra: ExtraMatch[] = [
    mk("m73", "dieciseisavos", "2026-07-01T12:00:00Z"),
    mk("m88", "dieciseisavos", "2026-07-03T20:00:00Z"),
    mk("m104", "final", "2026-07-19T19:00:00Z"),
  ];
  const first = new Date("2026-07-01T12:00:00Z").getTime();

  it("oculta antes del kickoff del primer partido de la fase", () => {
    expect(isExtraPhaseRevealed(extra, "dieciseisavos", first - 1)).toBe(false);
    expect(isExtraPhaseRevealed(extra, "dieciseisavos", first - 60 * 60 * 1000)).toBe(false);
  });
  it("revela exactamente desde el kickoff (aunque otros partidos sean días después)", () => {
    expect(isExtraPhaseRevealed(extra, "dieciseisavos", first)).toBe(true);
    expect(isExtraPhaseRevealed(extra, "dieciseisavos", first + 1)).toBe(true);
  });
  it("no revela una fase cuyo primer partido aún no llega", () => {
    expect(isExtraPhaseRevealed(extra, "final", first)).toBe(false);
  });
  it("no revela si la fase no tiene fechas válidas", () => {
    expect(isExtraPhaseRevealed([mk("m89", "octavos", "")], "octavos", first)).toBe(false);
  });
});

describe("teamNameByCode — código→nombre en todos los grupos (eliminatorias)", () => {
  const groups = {
    A: {
      teams: [
        { id: "MEX", nombre: "México" },
        { id: "RSA", nombre: "Sudáfrica" },
      ],
      pos1: "MEX",
      pos2: "RSA",
    },
    B: { teams: [{ id: "CAN", nombre: "Canadá" }], pos1: "CAN", pos2: null },
  } as unknown as Groups;
  it("resuelve un código a su nombre completo desde cualquier grupo", () => {
    expect(teamNameByCode(groups, "RSA")).toBe("Sudáfrica");
    expect(teamNameByCode(groups, "CAN")).toBe("Canadá");
  });
  it("devuelve el placeholder tal cual si no es un código conocido", () => {
    expect(teamNameByCode(groups, "Ganador Partido 74")).toBe("Ganador Partido 74");
    expect(teamNameByCode(groups, "Mejor 3° (A/B/C/D/F)")).toBe("Mejor 3° (A/B/C/D/F)");
  });
  it("vacío/null → cadena vacía", () => {
    expect(teamNameByCode(groups, null)).toBe("");
    expect(teamNameByCode(groups, "")).toBe("");
  });
});

describe("isTournamentComplete — el podio final solo se publica con TODOS los datos", () => {
  /** Estado completo de referencia: grupos con 1º/2º, Grupo K jugado, 32 llaves KO con
   *  resultado (incluida la final) y especiales oficiales. Cada test rompe UNA pieza. */
  const mkComplete = (): TournamentState => {
    const groups = Object.fromEntries(
      GROUP_KEYS.map((k) => [
        k,
        {
          teams: [
            { id: `${k}1`, nombre: `Equipo ${k}1` },
            { id: `${k}2`, nombre: `Equipo ${k}2` },
          ],
          pos1: `${k}1`,
          pos2: `${k}2`,
        },
      ]),
    ) as unknown as TournamentState["groups"];
    const kMatch = (id: string): TournamentState["group_k_matches"][number] => ({
      id,
      fecha: "2026-06-15T18:00:00Z",
      local: "K1",
      visitante: "K2",
      sede: "",
      gh: 1,
      ga: 0,
    });
    const ko = (id: string, fase: ExtraMatch["fase"]): ExtraMatch => ({
      id,
      fase,
      fecha: "2026-07-10T18:00:00Z",
      local: "A1",
      visitante: "B1",
      sede: "",
      gh: 2,
      ga: 1,
    });
    return {
      id: 1,
      groups,
      group_k_matches: [kMatch("k1"), kMatch("k2")],
      extra_matches: [
        ko("m73", "dieciseisavos"),
        ko("m89", "octavos"),
        ko("m97", "cuartos"),
        ko("m101", "semis"),
        ko("m103", "tercero"),
        ko("m104", "final"),
      ],
      goleadores: [],
      arqueros: [],
      goleador_id: "Kylian Mbappé (Francia)",
      arquero_id: "Emiliano Martínez (Argentina)",
      deadline: "2026-06-11T15:00:00Z",
      cuota_cop: 100000,
      updated_at: "2026-07-19T23:00:00Z",
    };
  };

  it("true cuando todos los datos oficiales están ingresados", () => {
    expect(isTournamentComplete(mkComplete())).toBe(true);
  });
  it("false si a un grupo le falta 1º/2º oficial", () => {
    const ts = mkComplete();
    ts.groups.L.pos2 = null;
    expect(isTournamentComplete(ts)).toBe(false);
  });
  it("false si un partido del Grupo K no tiene marcador", () => {
    const ts = mkComplete();
    ts.group_k_matches[1].ga = null;
    expect(isTournamentComplete(ts)).toBe(false);
  });
  it("false si una llave KO (la que sea) no tiene resultado", () => {
    const ts = mkComplete();
    ts.extra_matches![0].gh = null;
    expect(isTournamentComplete(ts)).toBe(false);
  });
  it("false si la final no tiene resultado o no existe la fase final", () => {
    const conFinalVacia = mkComplete();
    const finalMatch = conFinalVacia.extra_matches!.find((m) => m.fase === "final")!;
    finalMatch.gh = null;
    finalMatch.ga = null;
    expect(isTournamentComplete(conFinalVacia)).toBe(false);
    const sinFinal = mkComplete();
    sinFinal.extra_matches = sinFinal.extra_matches!.filter((m) => m.fase !== "final");
    expect(isTournamentComplete(sinFinal)).toBe(false);
  });
  it("false sin goleador o arquero oficial (aunque la final ya tenga marcador)", () => {
    const sinGoleador = mkComplete();
    sinGoleador.goleador_id = null;
    expect(isTournamentComplete(sinGoleador)).toBe(false);
    const arqueroVacio = mkComplete();
    arqueroVacio.arquero_id = "   ";
    expect(isTournamentComplete(arqueroVacio)).toBe(false);
  });
  it("false si el bracket KO aún no está sembrado (extra_matches vacío)", () => {
    const ts = mkComplete();
    ts.extra_matches = [];
    expect(isTournamentComplete(ts)).toBe(false);
  });

  describe("tournamentCompletion — checklist con faltantes por ítem", () => {
    it("todo completo: done=true y ningún ítem pendiente", () => {
      const { done, items } = tournamentCompletion(mkComplete());
      expect(done).toBe(true);
      expect(items.every((i) => i.done && i.pending === 0)).toBe(true);
      // Ítems clave presentes para el banner del admin.
      const keys = items.map((i) => i.key);
      expect(keys).toEqual(
        expect.arrayContaining(["grupos", "grupoK", "final", "goleador", "arquero"]),
      );
    });
    it("reporta cuántos faltan por ítem (2 grupos sin 1º/2º, especiales vacíos)", () => {
      const ts = mkComplete();
      ts.groups.A.pos1 = null;
      ts.groups.L.pos2 = null;
      ts.goleador_id = null;
      const { done, items } = tournamentCompletion(ts);
      expect(done).toBe(false);
      expect(items.find((i) => i.key === "grupos")).toMatchObject({ done: false, pending: 2 });
      expect(items.find((i) => i.key === "goleador")).toMatchObject({ done: false, pending: 1 });
      expect(items.find((i) => i.key === "arquero")).toMatchObject({ done: true, pending: 0 });
    });
    it("cuenta llaves KO sin resultado por fase", () => {
      const ts = mkComplete();
      const fin = ts.extra_matches!.find((m) => m.fase === "final")!;
      fin.gh = null;
      const { items } = tournamentCompletion(ts);
      expect(items.find((i) => i.key === "final")).toMatchObject({ done: false, pending: 1 });
      expect(items.find((i) => i.key === "semis")).toMatchObject({ done: true, pending: 0 });
    });
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

describe("especialMatches — espejo de especial_matches en SQL", () => {
  const GOL = "Kylian Mbappé (Francia)";
  const ARQ = "Unai Simón (España)";

  it("a) nombre completo igual (mayúsculas/acentos/espacios no rompen)", () => {
    expect(especialMatches("kylian mbappe (FRANCIA)", GOL)).toBe(true);
    expect(especialMatches("Unai Simón (España)", ARQ)).toBe(true);
  });
  it("a) nombre igual aunque un lado no traiga selección", () => {
    expect(especialMatches("Kylian Mbappé (Francia)", "Kylian Mbappé")).toBe(true);
  });
  it("b) typo pequeño en el nombre con la selección confirmando (caso Cuculeitodelbalon)", () => {
    expect(especialMatches("Kyllan Mbappé (Francia)", GOL)).toBe(true);
  });
  it("c) apellido solo con selección coincidente", () => {
    expect(especialMatches("Mbappe (Francia)", GOL)).toBe(true);
  });
  it("c) apellido solo SIN selección en un lado = ambiguo, no puntúa", () => {
    expect(especialMatches("Mbappe", GOL)).toBe(false);
    expect(especialMatches("Mbappe (Francia)", "Kylian Mbappé")).toBe(false);
  });
  it("nombre con palabras extra (nombre legal completo)", () => {
    expect(especialMatches("Harry Edward Kane (Inglaterra)", "Harry Kane (Inglaterra)")).toBe(true);
    expect(
      especialMatches("Damián Emiliano Martínez (Argentina)", "Emiliano Martínez (Argentina)"),
    ).toBe(true);
  });
  it("typo en la selección tolerado (Brasill) y alias Holanda ≡ Países Bajos", () => {
    expect(especialMatches("Alisson Becker (Brasill)", "Alisson Becker (Brasil)")).toBe(true);
    expect(especialMatches("Verbruggen (Holanda)", "Bart Verbruggen (Países Bajos)")).toBe(true);
  });
  it("otro jugador NO acierta (selecciones contradictorias o nombre distinto)", () => {
    expect(especialMatches("Harry Kane (Inglaterra)", GOL)).toBe(false);
    expect(especialMatches("Erling Haaland (Noruega)", GOL)).toBe(false);
    expect(especialMatches("Verbruggen (Holanda)", ARQ)).toBe(false);
    expect(especialMatches("Emiliano Martínez (Argentina)", ARQ)).toBe(false);
    expect(especialMatches("Lautaro Martínez (Argentina)", "Emiliano Martínez (Argentina)")).toBe(
      false,
    );
  });
  it("vacíos/null nunca aciertan", () => {
    expect(especialMatches(null, GOL)).toBe(false);
    expect(especialMatches("", GOL)).toBe(false);
    expect(especialMatches(GOL, null)).toBe(false);
    expect(especialMatches("   ", GOL)).toBe(false);
  });
});
