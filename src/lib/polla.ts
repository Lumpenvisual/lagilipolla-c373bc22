export const POLLA = {
  titulo: "LA GILIPOLLA 2026",
  sede: "Bar El Guanábano",
  cuotaCOP: 100_000,
  deadline: new Date("2026-06-11T10:00:00-05:00"),
  mundialStart: new Date("2026-06-11T11:00:00-05:00"),
  mundialEnd: new Date("2026-07-19T20:00:00-05:00"),
} as const;

export const fmtCOP = (n: number): string => "$" + (n ?? 0).toLocaleString("es-CO");

export const GROUP_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export type TeamCandidate = { id: string; n: string };
export type Team = {
  id: string;
  nombre: string;
  po?: string; // "UEFA-A"…"FIFA-2" when team is a play-off winner
  candidatos?: TeamCandidate[];
};
export type Group = { teams: Team[]; pos1: string | null; pos2: string | null };
export type Groups = Record<GroupKey, Group>;

export type GroupMatch = {
  id: string;
  fecha: string;
  local: string;
  visitante: string;
  sede: string;
  gh: number | null;
  ga: number | null;
};

export type SpecialPlayer = { id: string; nombre: string; seleccion: string };

/* ---- Especiales (goleador/arquero) como texto libre ----
 * El participante escribe nombre + selección; se persisten compuestos en el
 * mismo campo de texto (picks.goleador_id / arquero_id) como "Nombre (Selección)",
 * así el cálculo de puntos en SQL (igualdad de texto con el oficial) no cambia. */

export function composeSpecial(nombre: string, seleccion: string): string | null {
  const n = nombre.trim();
  const s = seleccion.trim();
  if (!n) return null;
  return s ? `${n} (${s})` : n;
}

export function parseSpecial(text: string | null | undefined): {
  nombre: string;
  seleccion: string;
} {
  if (!text) return { nombre: "", seleccion: "" };
  const m = text.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) return { nombre: m[1].trim(), seleccion: m[2].trim() };
  return { nombre: text.trim(), seleccion: "" };
}

export type Fase =
  | "grupos"
  | "dieciseisavos"
  | "octavos"
  | "cuartos"
  | "semis"
  | "tercero"
  | "final";

export type ExtraMatch = {
  id: string;
  fase: Fase;
  fecha: string;
  local: string;
  visitante: string;
  sede: string;
  gh: number | null;
  ga: number | null;
};

export type Phases = Record<Exclude<Fase, "grupos" | "tercero">, boolean> & {
  grupos: boolean;
  tercero?: boolean;
};

export type VisibilityKey = Fase | "goleador" | "arquero" | "historico";
/** Flags de visibilidad por fase/bloque. Ausente = visible. */
export type Visibility = Partial<Record<VisibilityKey, boolean>>;

/** Visible salvo apagado explícito. Tolera "false"/"true" string de registros jsonb antiguos. */
export function isSectionVisible(v: Visibility | undefined, key: VisibilityKey): boolean {
  const val = v?.[key] as boolean | string | undefined;
  return val !== false && val !== "false";
}

export type TournamentState = {
  id: number;
  groups: Groups;
  group_k_matches: GroupMatch[];
  extra_matches?: ExtraMatch[];
  phases?: Phases;
  visibility?: Visibility;
  goleadores: SpecialPlayer[];
  arqueros: SpecialPlayer[];
  goleador_id: string | null;
  arquero_id: string | null;
  deadline: string;
  cuota_cop: number;
  updated_at: string;
  picks_locked_at?: string | null;
};

export const FASE_LABEL: Record<Fase, string> = {
  grupos: "Fase de grupos",
  dieciseisavos: "Dieciseisavos de final",
  octavos: "Octavos de final",
  cuartos: "Cuartos de final",
  semis: "Semifinales",
  tercero: "Tercer puesto",
  final: "Final",
};

export type PickGroups = Partial<Record<GroupKey, { pos1: string | null; pos2: string | null }>>;
export type PickMatches = Record<string, { gh: number | null; ga: number | null }>;

export type PickRow = {
  participant_id: string;
  groups: PickGroups;
  group_k_matches: PickMatches;
  extra_matches?: PickMatches;
  goleador_id: string | null;
  arquero_id: string | null;
  puntos_grupos: number;
  puntos_partidos: number;
  puntos_especiales: number;
  puntos_total: number;
};

/** Find the display label of a "team slot" given the user's chosen candidate (if any). */
export function slotLabel(team: Team, chosenId: string | null | undefined): string {
  if (!team.po) return team.nombre;
  if (!chosenId || chosenId === team.id) return team.nombre;
  const cand = team.candidatos?.find((c) => c.id === chosenId);
  return cand ? cand.n : team.nombre;
}

/** All selectable ids for a team slot (the team itself + its candidates if PO). */
export function slotOptions(team: Team): { id: string; label: string; isCandidate: boolean }[] {
  const base = [{ id: team.id, label: team.nombre, isCandidate: false }];
  if (!team.po || !team.candidatos) return base;
  return [...base, ...team.candidatos.map((c) => ({ id: c.id, label: c.n, isCandidate: true }))];
}

export const FECHA_FMT = new Intl.DateTimeFormat("es-CO", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

export function fmtFecha(iso: string): string {
  return FECHA_FMT.format(new Date(iso)) + " COT";
}

/** Un partido queda bloqueado para edición de marcadores cuando faltan ≤ 24h para empezar. */
export function isMatchLocked(iso: string, nowMs: number = Date.now()): boolean {
  const start = new Date(iso).getTime();
  return start - nowMs <= 24 * 60 * 60 * 1000;
}

/* ---- Validación de marcadores (reglamento: un solo dígito, 0–9) ----
 * Se usa tanto en la planilla del usuario como en los resultados del admin,
 * y se refleja en el servidor (trigger picks_validate + guard recalc_all_picks). */
export const MAX_GOLES = 9;

/** Un marcador válido es un entero entre 0 y 9 (un dígito). */
export function isValidGol(n: number | null | undefined): boolean {
  return n != null && Number.isInteger(n) && n >= 0 && n <= MAX_GOLES;
}

/** Limita la entrada de un marcador a 0–9; "" → null. */
export function clampGol(v: string): number | null {
  if (v === "") return null;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(MAX_GOLES, n));
}

export type ScoreState = "vacio" | "completo" | "invalido";

/**
 * Estado de un marcador (gh/ga):
 *  - "vacio": ambos null (partido sin pronosticar / sin jugar) → permitido.
 *  - "completo": ambos enteros 0–9 → permitido.
 *  - "invalido": parcial (uno lleno y el otro no) o fuera de rango → se bloquea.
 */
export function scoreState(
  p: { gh: number | null; ga: number | null } | null | undefined,
): ScoreState {
  if (!p || (p.gh == null && p.ga == null)) return "vacio";
  return isValidGol(p.gh) && isValidGol(p.ga) ? "completo" : "invalido";
}

/** Un grupo tiene 1º y 2º repetidos (ambos elegidos e iguales). */
export function groupHasDup(
  sel: { pos1: string | null; pos2: string | null } | null | undefined,
): boolean {
  return !!(sel && sel.pos1 && sel.pos2 && sel.pos1 === sel.pos2);
}
