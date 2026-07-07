/**
 * Plantilla del bracket de eliminatorias — Mundial FIFA 2026 (48 equipos).
 *
 * Fuente única de la ESTRUCTURA del KO: 32 partidos (M73–M104) con su fase, sede,
 * fecha y los "slots" de origen de cada equipo. No contiene lógica de negocio: solo
 * describe el árbol del torneo. Los helpers puros de abajo lo usan para
 *   1) sembrar `tournament_state.extra_matches` (etiquetas placeholder), y
 *   2) resolver los cruces de dieciseisavos desde los `pos1/pos2` oficiales.
 *
 * ⚠️ Alineado con los datos YA cargados en producción: ids `m73`…`m104`, sedes y
 * fechas oficiales, y el formato de etiqueta usado por la app ("Segundo A",
 * "Ganador E", "Mejor 3° (A/B/C/D/F)", "Ganador Partido 74", "Perdedor Partido 101").
 * `buildExtraMatchesFromBracket()` reproduce exactamente ese estado (single source).
 *
 * Cruces verificados contra el bracket oficial FIFA 2026 (Wikipedia + Sky Sports):
 *   - 8 ganadores de grupo vs mejores terceros (M74,77,79,80,81,82,85,87)
 *   - 4 ganadores vs subcampeones (M75,76,84,86)
 *   - 4 subcampeón vs subcampeón (M73,78,83,88)
 */
import type { ExtraMatch, Fase, GroupKey, Groups } from "./polla";

/** Origen de un equipo en un partido de eliminatorias. */
export type Slot =
  | { kind: "winner"; group: GroupKey } // 1X — 1° del grupo X
  | { kind: "runner"; group: GroupKey } // 2X — 2° del grupo X
  | { kind: "third"; groups: GroupKey[] } // 3° de alguno de estos grupos (asignación manual)
  | { kind: "matchWinner"; match: string } // ganador del partido N (id de plantilla)
  | { kind: "matchLoser"; match: string }; // perdedor del partido N (id de plantilla)

export type BracketMatch = {
  /** id estable usado en extra_matches y picks (no cambia entre rondas). */
  id: string;
  /** Número de partido FIFA (73–104). */
  num: number;
  fase: Fase;
  /** Ciudad/sede oficial ("Estadio · Ciudad"). */
  sede: string;
  /** Fecha/hora oficial (ISO con offset). El admin puede ajustarla en Cronograma. */
  fecha: string;
  local: Slot;
  visitante: Slot;
};

const W = (group: GroupKey): Slot => ({ kind: "winner", group });
const R = (group: GroupKey): Slot => ({ kind: "runner", group });
const T = (...groups: GroupKey[]): Slot => ({ kind: "third", groups });
const WP = (num: number): Slot => ({ kind: "matchWinner", match: id(num) });
const LP = (num: number): Slot => ({ kind: "matchLoser", match: id(num) });

const id = (n: number) => `m${n}`;

export const KNOCKOUT_BRACKET: BracketMatch[] = [
  // ---- Dieciseisavos (Round of 32) ----
  {
    id: id(73),
    num: 73,
    fase: "dieciseisavos",
    sede: "SoFi Stadium · Inglewood",
    fecha: "2026-06-28T15:00:00-04:00",
    local: R("A"),
    visitante: R("B"),
  },
  {
    id: id(74),
    num: 74,
    fase: "dieciseisavos",
    sede: "Gillette Stadium · Foxborough",
    fecha: "2026-06-29T16:30:00-04:00",
    local: W("E"),
    visitante: T("A", "B", "C", "D", "F"),
  },
  {
    id: id(75),
    num: 75,
    fase: "dieciseisavos",
    sede: "Estadio BBVA · Monterrey",
    fecha: "2026-06-29T21:00:00-04:00",
    local: W("F"),
    visitante: R("C"),
  },
  {
    id: id(76),
    num: 76,
    fase: "dieciseisavos",
    sede: "NRG Stadium · Houston",
    fecha: "2026-06-29T13:00:00-04:00",
    local: W("C"),
    visitante: R("F"),
  },
  {
    id: id(77),
    num: 77,
    fase: "dieciseisavos",
    sede: "MetLife Stadium · East Rutherford",
    fecha: "2026-06-30T17:00:00-04:00",
    local: W("I"),
    visitante: T("C", "D", "F", "G", "H"),
  },
  {
    id: id(78),
    num: 78,
    fase: "dieciseisavos",
    sede: "AT&T Stadium · Arlington",
    fecha: "2026-06-30T13:00:00-04:00",
    local: R("E"),
    visitante: R("I"),
  },
  {
    id: id(79),
    num: 79,
    fase: "dieciseisavos",
    sede: "Estadio Azteca · Mexico City",
    fecha: "2026-06-30T21:00:00-04:00",
    local: W("A"),
    visitante: T("C", "E", "F", "H", "I"),
  },
  {
    id: id(80),
    num: 80,
    fase: "dieciseisavos",
    sede: "Mercedes-Benz Stadium · Atlanta",
    fecha: "2026-07-01T12:00:00-04:00",
    local: W("L"),
    visitante: T("E", "H", "I", "J", "K"),
  },
  {
    id: id(81),
    num: 81,
    fase: "dieciseisavos",
    sede: "Levi's Stadium · Santa Clara",
    fecha: "2026-07-01T20:00:00-04:00",
    local: W("D"),
    visitante: T("B", "E", "F", "I", "J"),
  },
  {
    id: id(82),
    num: 82,
    fase: "dieciseisavos",
    sede: "Lumen Field · Seattle",
    fecha: "2026-07-01T16:00:00-04:00",
    local: W("G"),
    visitante: T("A", "E", "H", "I", "J"),
  },
  {
    id: id(83),
    num: 83,
    fase: "dieciseisavos",
    sede: "BMO Field · Toronto",
    fecha: "2026-07-02T19:00:00-04:00",
    local: R("K"),
    visitante: R("L"),
  },
  {
    id: id(84),
    num: 84,
    fase: "dieciseisavos",
    sede: "SoFi Stadium · Inglewood",
    fecha: "2026-07-02T15:00:00-04:00",
    local: W("H"),
    visitante: R("J"),
  },
  {
    id: id(85),
    num: 85,
    fase: "dieciseisavos",
    sede: "BC Place · Vancouver",
    fecha: "2026-07-02T23:00:00-04:00",
    local: W("B"),
    visitante: T("E", "F", "G", "I", "J"),
  },
  {
    id: id(86),
    num: 86,
    fase: "dieciseisavos",
    sede: "Hard Rock Stadium · Miami Gardens",
    fecha: "2026-07-03T18:00:00-04:00",
    local: W("J"),
    visitante: R("H"),
  },
  {
    id: id(87),
    num: 87,
    fase: "dieciseisavos",
    sede: "Arrowhead Stadium · Kansas City",
    fecha: "2026-07-03T21:30:00-04:00",
    local: W("K"),
    visitante: T("D", "E", "I", "J", "L"),
  },
  {
    id: id(88),
    num: 88,
    fase: "dieciseisavos",
    sede: "AT&T Stadium · Arlington",
    fecha: "2026-07-03T14:00:00-04:00",
    local: R("D"),
    visitante: R("G"),
  },

  // ---- Octavos (Round of 16) ----
  {
    id: id(89),
    num: 89,
    fase: "octavos",
    sede: "Lincoln Financial Field · Philadelphia",
    fecha: "2026-07-04T17:00:00-04:00",
    local: WP(74),
    visitante: WP(77),
  },
  {
    id: id(90),
    num: 90,
    fase: "octavos",
    sede: "NRG Stadium · Houston",
    fecha: "2026-07-04T13:00:00-04:00",
    local: WP(73),
    visitante: WP(75),
  },
  {
    id: id(91),
    num: 91,
    fase: "octavos",
    sede: "MetLife Stadium · East Rutherford",
    fecha: "2026-07-05T16:00:00-04:00",
    local: WP(76),
    visitante: WP(78),
  },
  {
    id: id(92),
    num: 92,
    fase: "octavos",
    sede: "Estadio Azteca · Mexico City",
    fecha: "2026-07-05T20:00:00-04:00",
    local: WP(79),
    visitante: WP(80),
  },
  {
    id: id(93),
    num: 93,
    fase: "octavos",
    sede: "AT&T Stadium · Arlington",
    fecha: "2026-07-06T15:00:00-04:00",
    local: WP(83),
    visitante: WP(84),
  },
  {
    id: id(94),
    num: 94,
    fase: "octavos",
    sede: "Lumen Field · Seattle",
    fecha: "2026-07-06T20:00:00-04:00",
    local: WP(81),
    visitante: WP(82),
  },
  {
    id: id(95),
    num: 95,
    fase: "octavos",
    sede: "Mercedes-Benz Stadium · Atlanta",
    fecha: "2026-07-07T12:00:00-04:00",
    local: WP(86),
    visitante: WP(88),
  },
  {
    id: id(96),
    num: 96,
    fase: "octavos",
    sede: "BC Place · Vancouver",
    fecha: "2026-07-07T16:00:00-04:00",
    local: WP(85),
    visitante: WP(87),
  },

  // ---- Cuartos ----
  {
    id: id(97),
    num: 97,
    fase: "cuartos",
    sede: "Gillette Stadium · Foxborough",
    fecha: "2026-07-09T16:00:00-04:00",
    local: WP(89),
    visitante: WP(90),
  },
  {
    id: id(98),
    num: 98,
    fase: "cuartos",
    sede: "SoFi Stadium · Inglewood",
    fecha: "2026-07-10T15:00:00-04:00",
    local: WP(93),
    visitante: WP(94),
  },
  {
    id: id(99),
    num: 99,
    fase: "cuartos",
    sede: "Hard Rock Stadium · Miami Gardens",
    fecha: "2026-07-11T17:00:00-04:00",
    local: WP(91),
    visitante: WP(92),
  },
  {
    id: id(100),
    num: 100,
    fase: "cuartos",
    sede: "Arrowhead Stadium · Kansas City",
    fecha: "2026-07-11T21:00:00-04:00",
    local: WP(95),
    visitante: WP(96),
  },

  // ---- Semifinales ----
  {
    id: id(101),
    num: 101,
    fase: "semis",
    sede: "AT&T Stadium · Arlington",
    fecha: "2026-07-14T15:00:00-04:00",
    local: WP(97),
    visitante: WP(98),
  },
  {
    id: id(102),
    num: 102,
    fase: "semis",
    sede: "Mercedes-Benz Stadium · Atlanta",
    fecha: "2026-07-15T15:00:00-04:00",
    local: WP(99),
    visitante: WP(100),
  },

  // ---- Tercer puesto ----
  {
    id: id(103),
    num: 103,
    fase: "tercero",
    sede: "Hard Rock Stadium · Miami Gardens",
    fecha: "2026-07-18T17:00:00-04:00",
    local: LP(101),
    visitante: LP(102),
  },

  // ---- Final ----
  {
    id: id(104),
    num: 104,
    fase: "final",
    sede: "MetLife Stadium · East Rutherford",
    fecha: "2026-07-19T15:00:00-04:00",
    local: WP(101),
    visitante: WP(102),
  },
];

/** Ids de los partidos de dieciseisavos cuyo visitante es un mejor tercero (asignación manual del admin). */
export const THIRD_SLOT_MATCH_IDS: string[] = KNOCKOUT_BRACKET.filter(
  (m) => m.fase === "dieciseisavos" && m.visitante.kind === "third",
).map((m) => m.id);

/** Etiqueta humana legible de un slot (placeholder cuando aún no se conoce el equipo). */
export function slotLabel(slot: Slot): string {
  switch (slot.kind) {
    case "winner":
      return `Ganador ${slot.group}`;
    case "runner":
      return `Segundo ${slot.group}`;
    case "third":
      return `Mejor 3° (${slot.groups.join("/")})`;
    case "matchWinner":
      return `Ganador Partido ${slot.match.replace("m", "")}`;
    case "matchLoser":
      return `Perdedor Partido ${slot.match.replace("m", "")}`;
  }
}

/**
 * Resuelve el código de equipo de un slot, o null si aún no se conoce.
 *  - winner/runner: desde groups[grupo].pos1/pos2 (resultados oficiales).
 *  - third: desde la asignación manual del admin (thirds[matchId]).
 *  - matchWinner/matchLoser: desde los ganadores designados (winners[matchId]).
 */
export function resolveSlot(
  slot: Slot,
  ctx: {
    groups?: Groups;
    /** Asignación manual de terceros: id de partido R32 → código de equipo. */
    thirds?: Record<string, string | null | undefined>;
    /** Ganadores designados por partido: id de plantilla → código de equipo. */
    winners?: Record<string, string | null | undefined>;
    /** Equipos por partido ya resueltos (para deducir el perdedor). */
    teamsByMatch?: Record<string, { local: string | null; visitante: string | null }>;
    /** id del partido que contiene este slot (para terceros). */
    matchId?: string;
  },
): string | null {
  switch (slot.kind) {
    case "winner":
      return ctx.groups?.[slot.group]?.pos1 ?? null;
    case "runner":
      return ctx.groups?.[slot.group]?.pos2 ?? null;
    case "third":
      return ctx.matchId ? (ctx.thirds?.[ctx.matchId] ?? null) : null;
    case "matchWinner":
      return ctx.winners?.[slot.match] ?? null;
    case "matchLoser": {
      const win = ctx.winners?.[slot.match];
      const teams = ctx.teamsByMatch?.[slot.match];
      if (!win || !teams) return null;
      if (teams.local && teams.local !== win) return teams.local;
      if (teams.visitante && teams.visitante !== win) return teams.visitante;
      return null;
    }
  }
}

/**
 * Construye el array `extra_matches` completo desde la plantilla, con etiquetas
 * placeholder en local/visitante y marcadores en null. Reproduce el estado canónico
 * (mismos ids, sedes y fechas que producción) para sembrar un entorno nuevo.
 */
export function buildExtraMatchesFromBracket(): ExtraMatch[] {
  return KNOCKOUT_BRACKET.map((m) => ({
    id: m.id,
    fase: m.fase,
    fecha: m.fecha,
    local: slotLabel(m.local),
    visitante: slotLabel(m.visitante),
    sede: m.sede,
    gh: null,
    ga: null,
  }));
}

/**
 * Rellena los cruces de DIECISEISAVOS dentro de un array `extra_matches` existente:
 *  - resuelve 1X/2X desde groups.pos1/pos2,
 *  - resuelve terceros desde la asignación manual,
 *  - conserva el placeholder cuando un slot no es resoluble,
 *  - preserva marcadores (gh/ga), fecha y demás fases intactos.
 * Si faltan partidos de la plantilla, los añade (idempotente).
 */
export function applyRound32(
  extras: ExtraMatch[],
  groups: Groups,
  thirds: Record<string, string | null | undefined>,
): ExtraMatch[] {
  const byId = new Map(extras.map((m) => [m.id, m]));
  const result = [...extras];
  for (const tpl of KNOCKOUT_BRACKET) {
    if (tpl.fase !== "dieciseisavos") continue;
    const localCode = resolveSlot(tpl.local, { groups, thirds, matchId: tpl.id });
    const visitCode = resolveSlot(tpl.visitante, { groups, thirds, matchId: tpl.id });
    const local = localCode ?? slotLabel(tpl.local);
    const visitante = visitCode ?? slotLabel(tpl.visitante);
    const existing = byId.get(tpl.id);
    if (existing) {
      existing.local = local;
      existing.visitante = visitante;
    } else {
      result.push({
        id: tpl.id,
        fase: tpl.fase,
        fecha: tpl.fecha,
        local,
        visitante,
        sede: tpl.sede,
        gh: null,
        ga: null,
      });
    }
  }
  return result;
}

/**
 * Avanza ganadores designados a las rondas siguientes (octavos → final + tercer puesto):
 * rellena local/visitante de los partidos cuyos slots son matchWinner/matchLoser.
 * `winners` mapea id de plantilla → código del equipo ganador oficial (el admin lo
 * designa porque un empate se define por penales y no se deduce de gh/ga).
 * Conserva marcadores y todo lo no afectado.
 */
export function applyAdvance(
  extras: ExtraMatch[],
  winners: Record<string, string | null | undefined>,
): ExtraMatch[] {
  // Equipos ya resueltos por partido (códigos, no placeholders) para deducir perdedores.
  const teamsByMatch: Record<string, { local: string | null; visitante: string | null }> = {};
  for (const m of extras) {
    teamsByMatch[m.id] = {
      local: isTeamCode(m.local) ? m.local : null,
      visitante: isTeamCode(m.visitante) ? m.visitante : null,
    };
  }
  const tplById = new Map(KNOCKOUT_BRACKET.map((m) => [m.id, m]));
  return extras.map((m) => {
    const tpl = tplById.get(m.id);
    if (!tpl) return m;
    const needsLocal = tpl.local.kind === "matchWinner" || tpl.local.kind === "matchLoser";
    const needsVisit = tpl.visitante.kind === "matchWinner" || tpl.visitante.kind === "matchLoser";
    if (!needsLocal && !needsVisit) return m;
    const ctx = { winners, teamsByMatch };
    const local = needsLocal ? (resolveSlot(tpl.local, ctx) ?? m.local) : m.local;
    const visitante = needsVisit ? (resolveSlot(tpl.visitante, ctx) ?? m.visitante) : m.visitante;
    return { ...m, local, visitante };
  });
}

/**
 * Auto-avance de TODAS las rondas a partir de los marcadores ya cargados:
 * en cada pasada deriva los ganadores del estado ACTUAL (ganador por marcador; empate
 * `gh==ga` → `penWinners[id]` designado por el admin) y aplica `applyAdvance`. Recalcular
 * por pasada permite encadenar dieciseisavos→octavos→cuartos… en un solo guardado
 * (una ronda recién avanzada expone los equipos reales para derivar la siguiente).
 * Idempotente: itera hasta estabilizar (máx. 6 pasadas = profundidad del bracket).
 */
export function advanceAllRounds(
  extras: ExtraMatch[],
  penWinners: Record<string, string | null | undefined> = {},
): ExtraMatch[] {
  const slotKey = (arr: ExtraMatch[]) =>
    arr.map((m) => `${m.id}:${m.local}|${m.visitante}`).join(";");
  let cur = extras;
  for (let pass = 0; pass < 6; pass++) {
    const winners: Record<string, string> = {};
    for (const m of cur) {
      if (m.gh == null || m.ga == null) continue;
      if (m.gh > m.ga) winners[m.id] = m.local;
      else if (m.ga > m.gh) winners[m.id] = m.visitante;
      else {
        const pw = penWinners[m.id];
        if (pw) winners[m.id] = pw;
      }
    }
    const next = applyAdvance(cur, winners);
    if (slotKey(next) === slotKey(cur)) break;
    cur = next;
  }
  return cur;
}

/**
 * Un valor de local/visitante es un código de equipo real (p.ej. "MEX", "COL", "UEFA-D")
 * y no una etiqueta placeholder ("Segundo A", "Ganador Partido 74", "Mejor 3° (…)").
 */
function isTeamCode(v: string | null | undefined): v is string {
  return !!v && /^[A-Z]{2,4}(-[A-Z0-9]+)?$/.test(v);
}
